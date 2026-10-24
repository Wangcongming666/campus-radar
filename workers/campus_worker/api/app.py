import hmac
from uuid import UUID
from fastapi import Depends, FastAPI, Header, HTTPException
from campus_worker.settings import Settings
from campus_worker.executor.queue import TaskQueue


def create_app(settings: Settings | None = None, queue=None) -> FastAPI:
    config = settings or Settings.from_env()
    repository = queue if queue is not None else (TaskQueue(config.database_url) if config.database_url else None)
    app = FastAPI(title='Campus worker internal control', docs_url=None, redoc_url=None, openapi_url=None)

    def authorized(authorization: str | None = Header(default=None)):
        if len(config.control_token) < 32:
            raise HTTPException(503, detail={'code': 'CONTROL_AUTH_NOT_CONFIGURED'})
        if not authorization or not hmac.compare_digest(authorization, 'Bearer ' + config.control_token):
            raise HTTPException(401, detail={'code': 'UNAUTHORIZED'})

    def require_queue():
        if repository is None:
            raise HTTPException(503, detail={'code': 'WORKER_DATABASE_NOT_CONFIGURED'})
        return repository

    @app.get('/health/live')
    def live():
        return {'status': 'live'}

    @app.get('/health/ready')
    def ready():
        db = require_queue()
        try:
            db.ready()
        except Exception:
            raise HTTPException(503, detail={'code': 'DATABASE_NOT_READY'}) from None
        return {'status': 'ready'}

    @app.get('/internal/tasks/{task_id}', dependencies=[Depends(authorized)])
    def get_task(task_id: UUID):
        try:
            task = require_queue().get(task_id)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, detail={'code': 'DATABASE_NOT_READY'}) from None
        if task is None:
            raise HTTPException(404, detail={'code': 'TASK_NOT_FOUND'})
        # The control plane does not reveal leases, payloads or object download URLs.
        return {'data': {key: task.get(key) for key in ('id', 'type', 'state', 'attempt',
                        'max_attempts', 'progress', 'error_code', 'available_at', 'updated_at')}}

    @app.post('/internal/tasks/{task_id}/cancel', dependencies=[Depends(authorized)])
    def cancel_task(task_id: UUID):
        db = require_queue()
        try:
            if db.cancel(task_id):
                return {'data': {'id': task_id, 'state': 'cancelled'}}
            task = db.get(task_id)
        except Exception:
            raise HTTPException(503, detail={'code': 'DATABASE_NOT_READY'}) from None
        if task is None:
            raise HTTPException(404, detail={'code': 'TASK_NOT_FOUND'})
        if task['state'] == 'cancelled':
            return {'data': {'id': task_id, 'state': 'cancelled'}}
        raise HTTPException(409, detail={'code': 'TASK_ALREADY_TERMINAL'})

    return app


app = create_app()
