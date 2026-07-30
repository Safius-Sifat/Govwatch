/**
 * Lightweight translation table for GovWatch UI strings.
 * Bengali (bn) is the default — the platform is for Bangladesh civic use.
 */

import type { Language } from './types'

export type Dict = Record<string, string>

const en: Dict = {
  brand: 'GovWatch',
  tagline: 'Ask anything about Bangladesh government procurement',
  hero_title: 'What does Bangladesh government spend your tax on?',
  hero_subtitle:
    'Search 200,000+ awarded contracts, gazettes, and public records in plain Bangla or English.',
  search_placeholder: 'Ask in Bangla or English...',
  search_button: 'Ask',
  searching: 'Searching...',
  suggested_title: 'Try one of these',
  suggestion_road_construction:
    'Which ministry spent the most on road construction in Dhaka last year?',
  suggestion_vendor:
    'Show me top vendors by contract value in the last 12 months',
  suggestion_anomaly:
    'What anomalies did you flag in 2024 health sector tenders?',
  suggestion_bangla:
    'গত বছরে ঢাকায় কোন মন্ত্রণালয় সড়ক নির্মাণে সবচেয়ে বেশি খরচ করেছে?',
  citation_heading: 'Sources',
  anomaly_alert: 'Anomaly detected',
  anomaly_explainer:
    'This contract was flagged by our anomaly detection (z-score on amount and procurement method).',
  sources_pdf: 'Open PDF',
  sources_tender: 'View tender',
  nav_search: 'Search',
  nav_anomalies: 'Anomalies',
  nav_vendors: 'Vendors',
  nav_stats: 'Stats',
  nav_about: 'About',
  footer_credit: 'Data sourced from eprocure.gov.bd',
  stats_contracts: 'Contracts',
  stats_vendors: 'Vendors',
  stats_value: 'Total value (BDT)',
  stats_anomalies: 'Anomalies',
  stats_ministries: 'Ministries',
  stats_districts: 'Districts',
  empty_state: 'Type a question above to get started.',
}

const bn: Dict = {
  brand: 'GovWatch',
  tagline: 'বাংলাদেশ সরকারের ক্রয় সম্পর্কে যেকোনো প্রশ্ন করুন',
  hero_title: 'বাংলাদেশ সরকার আপনার কর কোথায় খরচ করে?',
  hero_subtitle:
    '২ লক্ষেরও বেশি চুক্তি, গেজেট ও সরকারি রেকর্ড বাংলা বা ইংরেজিতে অনুসন্ধান করুন।',
  search_placeholder: 'বাংলা বা ইংরেজিতে প্রশ্ন লিখুন...',
  search_button: 'জিজ্ঞেস করুন',
  searching: 'অনুসন্ধান চলছে...',
  suggested_title: 'এগুলোর একটি চেষ্টা করুন',
  suggestion_road_construction:
    'গত বছরে ঢাকায় সড়ক নির্মাণে কোন মন্ত্রণালয় সবচেয়ে বেশি খরচ করেছে?',
  suggestion_vendor:
    'গত ১২ মাসে চুক্তির মূল্য অনুযায়ী শীর্ষ ঠিকাদারদের দেখান',
  suggestion_anomaly:
    '২০২৪ সালের স্বাস্থ্য খাতের দরপত্রে আপনারা কী অসঙ্গতি চিহ্নিত করেছেন?',
  suggestion_bangla:
    'গত বছরে ঢাকায় কোন মন্ত্রণালয় সড়ক নির্মাণে সবচেয়ে বেশি খরচ করেছে?',
  citation_heading: 'সূত্র',
  anomaly_alert: 'অসঙ্গতি শনাক্ত',
  anomaly_explainer:
    'এই চুক্তিটি আমাদের অসঙ্গতি সনাক্তকরণ (পরিমাণ ও ক্রয় পদ্ধতির ভিত্তিতে z-score) দ্বারা চিহ্নিত হয়েছে।',
  sources_pdf: 'পিডিএফ দেখুন',
  sources_tender: 'দরপত্র দেখুন',
  nav_search: 'অনুসন্ধান',
  nav_anomalies: 'অসঙ্গতি',
  nav_vendors: 'ঠিকাদার',
  nav_stats: 'পরিসংখ্যান',
  nav_about: 'সম্পর্কে',
  footer_credit: 'ডেটার উৎস: eprocure.gov.bd',
  stats_contracts: 'চুক্তি',
  stats_vendors: 'ঠিকাদার',
  stats_value: 'মোট মূল্য (টাকা)',
  stats_anomalies: 'অসঙ্গতি',
  stats_ministries: 'মন্ত্রণালয়',
  stats_districts: 'জেলা',
  empty_state: 'শুরু করতে উপরে একটি প্রশ্ন লিখুন।',
}

const dictionaries: Record<Language, Dict> = { en, bn }

export function getDict(lang: Language): Dict {
  return dictionaries[lang]
}

export function t(lang: Language, key: string): string {
  return dictionaries[lang][key] ?? dictionaries.en[key] ?? key
}