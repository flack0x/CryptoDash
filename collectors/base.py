"""Base collector class — all data sources inherit from this."""

import logging
import time
from abc import ABC, abstractmethod

import httpx

logger = logging.getLogger(__name__)


class BaseCollector(ABC):
    """Base class for all data collectors."""

    name: str = "base"

    def __init__(self):
        self.client = httpx.Client(timeout=30, follow_redirects=True)
        self._last_call = 0.0

    @abstractmethod
    def collect(self):
        """Run the collection. Each subclass implements this."""
        ...

    def get(self, url: str, params: dict | None = None, headers: dict | None = None, min_interval: float = 2.0) -> dict | list | None:
        """Make a rate-limited GET request. Returns parsed JSON or None on error."""
        elapsed = time.time() - self._last_call
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)

        try:
            resp = self.client.get(url, params=params, headers=headers)
            self._last_call = time.time()

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 60))
                logger.warning(f"[{self.name}] Rate limited. Waiting {retry_after}s")
                time.sleep(retry_after)
                return self.get(url, params=params, headers=headers, min_interval=min_interval)

            resp.raise_for_status()
            return resp.json()

        except httpx.HTTPStatusError as e:
            logger.error(f"[{self.name}] HTTP {e.response.status_code}: {url}")
            return None
        except httpx.RequestError as e:
            logger.error(f"[{self.name}] Request failed: {e}")
            return None
        except Exception as e:
            logger.error(f"[{self.name}] Unexpected error: {e}")
            return None

    def close(self):
        self.client.close()
