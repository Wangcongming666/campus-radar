from dataclasses import dataclass
from urllib.parse import urlsplit
import ipaddress


class SourceNotApproved(ValueError):
    pass


@dataclass(frozen=True)
class SourcePolicy:
    source_id: str
    enabled: bool = False
    permission_status: str = 'pending'
    allowed_hosts: tuple[str, ...] = ()
    company_id: str | None = None
    robots_checked: bool = False
    terms_note: str = ''

    def require_access(self, allowed_sources: tuple[str, ...], url: str) -> None:
        parsed = urlsplit(url)
        host = (parsed.hostname or '').lower()
        try:
            ipaddress.ip_address(host)
            literal_ip = True
        except ValueError:
            literal_ip = False
        if (not self.enabled or self.permission_status != 'approved'
                or self.source_id not in allowed_sources or not self.company_id
                or not self.robots_checked or not self.terms_note.strip()
                or parsed.scheme != 'https' or parsed.username or parsed.password
                or host not in self.allowed_hosts or literal_ip
                or host == 'localhost' or host.endswith('.localhost')
                or parsed.port not in (None, 443)):
            raise SourceNotApproved('Source is disabled, unreviewed, or outside its approved origin')
