"""Task failures carry safe public codes; provider responses are never logged."""


class TaskError(Exception):
    def __init__(self, code: str, *, retryable: bool = False):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class LeaseLost(TaskError):
    def __init__(self):
        super().__init__('LEASE_LOST')
