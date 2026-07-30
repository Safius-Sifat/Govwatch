"""Minimal setup.py so Scrapy can import the egp_scraper package."""
from setuptools import setup, find_packages

setup(
    name="egp_scraper",
    version="0.1.0",
    packages=find_packages(),
    include_package_data=True,
)