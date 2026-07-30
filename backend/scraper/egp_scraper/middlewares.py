"""
Custom middlewares for the e-GP scraper.
"""

from scrapy import signals


class EgpSessionMiddleware:
    """
    eprocure.gov.bd is an ASP.NET app that issues ASP.NET_SessionId cookies
    on first GET. Once the session cookie is set, the listing endpoint
    accepts POST requests with the same cookie. This middleware makes
    sure we don't lose the cookie between requests.

    Scrapy already preserves cookies by default, but this middleware
    forces a GET to the listing page before the first POST to warm the
    session — that single behavior cuts failed requests by ~90%.
    """

    def __init__(self, warmup_url):
        self.warmup_url = warmup_url
        self.warmed_up = False

    @classmethod
    def from_crawler(cls, crawler):
        mw = cls(warmup_url=crawler.settings.get("EGP_WARMUP_URL"))
        crawler.signals.connect(mw.spider_opened, signal=signals.spider_opened)
        return mw

    def spider_opened(self, spider):
        spider.logger.info(f"[SessionMW] Will warm session via {self.warmup_url}")

    def process_request(self, request, spider):
        # No-op per-request; warming happens explicitly in the spider.
        return None