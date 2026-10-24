from dataclasses import asdict
import json
from pathlib import Path
import subprocess
import tempfile
import sys
import time
from uuid import UUID, uuid4
from jsonschema import Draft202012Validator, FormatChecker
from campus_worker.crawlers.callback import BatchClient
from campus_worker.crawlers.policy import SourcePolicy, SourceNotApproved
from campus_worker.tasks import TaskError


def validate_jobs(jobs, policy, allowed_sources):
    contract = json.loads((Path(__file__).parents[2] / 'contracts' / 'crawl-job.schema.json').read_text())
    validator = Draft202012Validator(contract, format_checker=FormatChecker())
    seen = set()
    result = []
    for job in jobs:
        if list(validator.iter_errors(job)):
            raise TaskError('SOURCE_INVALID_JOB')
        if job['companyId'] != policy.company_id:
            raise TaskError('SOURCE_COMPANY_MISMATCH')
        policy.require_access(allowed_sources, job['canonicalUrl'])
        if (job['deadlinePrecision'] == 'unknown') != (job['deadlineAt'] is None):
            raise TaskError('SOURCE_INVALID_DEADLINE')
        key = job['canonicalUrl']
        if key in seen:
            continue
        seen.add(key)
        result.append(job)
    return result


def crawl(context, settings):
    try:
        source_id = UUID(context.task['payload']['sourceId'])
    except (KeyError, ValueError, TypeError):
        raise TaskError('INVALID_TASK_PAYLOAD') from None
    queue = context.queue
    source = queue.source(source_id)
    if source is None:
        raise TaskError('SOURCE_NOT_FOUND')
    policy = SourcePolicy(source_id=str(source_id), enabled=source['enabled'],
                          permission_status=source['permission_status'], allowed_hosts=tuple(source['allowed_hosts']),
                          company_id=str(source['company_id']) if source['company_id'] else None,
                          robots_checked=source['robots_checked_at'] is not None, terms_note=source['terms_note'])
    try:
        policy.require_access(settings.allowed_sources, source['base_url'])
    except SourceNotApproved:
        raise TaskError('SOURCE_NOT_APPROVED') from None
    if source['allowed_content_mode'] != 'licensed_full':
        raise TaskError('SOURCE_CONTENT_LICENSE_NOT_CONFIGURED')
    if source['rate_policy'].get('adapter') != 'official_json_v1':
        raise TaskError('SOURCE_ADAPTER_NOT_CONFIGURED')
    client = BatchClient(settings)
    context.checkpoint()
    run_id = queue.begin_crawl(context.task['id'], context.task['lease_token'], source_id)
    if run_id is None:
        raise TaskError('LEASE_LOST')
    child_input = json.dumps({'policy': asdict(policy), 'allowedSources': settings.allowed_sources, 'url': source['base_url'], 'delaySeconds': max(6, float(source['rate_policy'].get('delaySeconds', 6)))})
    output_file = tempfile.TemporaryFile(mode='w+t')
    process = subprocess.Popen([sys.executable, '-m', 'campus_worker.crawlers.child'],
                               stdin=subprocess.PIPE, stdout=output_file, stderr=subprocess.DEVNULL, text=True)
    try:
        process.stdin.write(child_input)
        process.stdin.close()
        started = time.monotonic()
        while process.poll() is None:
            context.checkpoint()
            if time.monotonic() - started > 180:
                raise TaskError('SOURCE_TIMEOUT', retryable=True)
            context.done.wait(0.5)
        output_file.seek(0)
        output = output_file.read(2 * 1024 * 1024 + 1)
        if process.returncode != 0 or len(output) > 2 * 1024 * 1024:
            raise TaskError('SOURCE_PROCESS_FAILED', retryable=True)
        try:
            data = json.loads(output)
        except ValueError:
            raise TaskError('SOURCE_INVALID_FEED') from None
        error = data.get('error')
        if error:
            if error in ('SOURCE_PAUSED_403', 'SOURCE_PAUSED_429'):
                queue.pause_source(source_id, context.task['id'], context.task['lease_token'])
            raise TaskError(error, retryable=error in ('SOURCE_FETCH_FAILED', 'SOURCE_HTTP_ERROR'))
        jobs = validate_jobs(data['jobs'], policy, settings.allowed_sources)
        for offset in range(0, len(jobs), 10):
            client.send({'sourceId': str(source_id), 'runId': str(run_id), 'taskId': str(context.task['id']),
                         'leaseToken': str(context.task['lease_token']), 'batchId': str(uuid4()),
                         'jobs': jobs[offset:offset + 10], 'final': False}, context.checkpoint)
        client.send({'sourceId': str(source_id), 'runId': str(run_id), 'taskId': str(context.task['id']),
                     'leaseToken': str(context.task['lease_token']), 'batchId': str(uuid4()),
                     'jobs': [], 'final': True}, context.checkpoint)
        return {'schemaVersion': 1, 'runId': str(run_id), 'observed': len(jobs)}
    except Exception:
        queue.fail_crawl(run_id, context.task['id'], context.task['lease_token'])
        raise
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
        output_file.close()
