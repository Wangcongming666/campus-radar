"""One serial task per process, with independent heartbeat and cooperative cancellation."""
import logging
import os
import signal
import socket
from threading import Event, Thread
from uuid import uuid4
from campus_worker.executor.queue import TaskQueue
from campus_worker.settings import Settings
from campus_worker.tasks import LeaseLost, TaskError

logger = logging.getLogger(__name__)


class TaskContext:
    def __init__(self, task, queue, stop: Event, lease_seconds=60):
        self.task, self.queue, self.stop = task, queue, stop
        self.lost = Event()
        self.done = Event()
        self.lease_seconds = lease_seconds

    def checkpoint(self):
        if self.lost.is_set() or self.stop.is_set():
            raise LeaseLost()
        # Fence external side effects as well as final task completion.
        if not self.queue.heartbeat(self.task['id'], self.task['lease_token'], lease_seconds=self.lease_seconds):
            self.lost.set()
            raise LeaseLost()

    def maintain(self):
        while not self.done.wait(self.lease_seconds / 3):
            try:
                self.checkpoint()
            except Exception:
                # Any uncertain DB outcome is treated as loss of authority.
                self.lost.set()
                return


def dispatch(context: TaskContext, settings: Settings):
    task = context.task
    if task['payload'].get('schemaVersion') != 1:
        raise TaskError('INVALID_TASK_PAYLOAD')
    if task['type'] == 'CRAWL_JOBS':
        from campus_worker.crawlers.run import crawl
        return crawl(context, settings)
    if task['type'] == 'DATA_EXPORT':
        raise TaskError('DATA_EXPORT_NOT_CONFIGURED')
    if task['type'] == 'USER_ERASURE':
        # Never delete only SQL rows while leaving provider identity and private objects behind.
        raise TaskError('USER_ERASURE_NOT_CONFIGURED')
    raise TaskError('UNSUPPORTED_TASK_TYPE')


class Executor:
    def __init__(self, queue, settings: Settings, handler=dispatch, owner=None, lease_seconds=60):
        self.queue, self.settings, self.handler = queue, settings, handler
        self.owner = owner or f'{socket.gethostname()}:{os.getpid()}:{uuid4()}'
        self.stop = Event()
        self.lease_seconds = lease_seconds

    def run_once(self):
        self.queue.recover_expired()
        task = self.queue.claim(self.owner, lease_seconds=self.lease_seconds)
        if task is None:
            return False
        context = TaskContext(task, self.queue, self.stop, self.lease_seconds)
        heartbeat = Thread(target=context.maintain, daemon=True)
        heartbeat.start()
        try:
            context.checkpoint()
            result = self.handler(context, self.settings)
            context.checkpoint()
            self.queue.finish(task['id'], task['lease_token'], result)
        except LeaseLost:
            logger.info('task lease revoked task_id=%s', task['id'])
        except TaskError as error:
            self.queue.fail(task['id'], task['lease_token'], error.code, retryable=error.retryable)
        except Exception:
            logger.error('task failed task_id=%s code=INTERNAL_WORKER_ERROR', task['id'])
            self.queue.fail(task['id'], task['lease_token'], 'INTERNAL_WORKER_ERROR')
        finally:
            context.done.set()
            heartbeat.join(timeout=2)
        return True

    def run(self):
        while not self.stop.is_set():
            try:
                found = self.run_once()
            except Exception:
                logger.error('executor database unavailable')
                found = False
            if not found:
                self.stop.wait(2)


def main():
    logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO'))
    settings = Settings.from_env()
    worker = Executor(TaskQueue(settings.database_url), settings)
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: worker.stop.set())
    worker.run()


if __name__ == '__main__':
    main()
