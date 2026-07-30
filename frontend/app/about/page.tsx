import { cookies } from 'next/headers'

import { GovWatchFooter } from '@/components/layout/govwatch-footer'
import { GovWatchHeader } from '@/components/layout/govwatch-header'
import type { Language } from '@/lib/govwatch/types'

export const dynamic = 'force-dynamic'

export default async function AboutPage() {
  const cookieStore = await cookies()
  const langCookie = cookieStore.get('govwatch_lang')?.value
  const language: Language = langCookie === 'en' ? 'en' : 'bn'

  return (
    <div className="flex min-h-screen flex-col">
      <GovWatchHeader language={language} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 text-sm leading-relaxed">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">
          {language === 'bn' ? 'GovWatch সম্পর্কে' : 'About GovWatch'}
        </h1>

        <section className="mb-8 space-y-3">
          <p>
            {language === 'bn'
              ? 'GovWatch হলো বাংলাদেশের সরকারি ক্রয় ডেটার একটি AI-চালিত অনুসন্ধান প্ল্যাটফর্ম। আমরা eprocure.gov.bd-এর প্রকাশ্য চুক্তির ডেটা সংগ্রহ করে সাধারণ মানুষের জন্য বাংলা ও ইংরেজিতে অনুসন্ধানযোগ্য করে তুলি।'
              : 'GovWatch is an AI-powered civic intelligence platform for Bangladesh government procurement. We crawl public contract data from eprocure.gov.bd and make it queryable in plain Bangla or English.'}
          </p>
          <p>
            {language === 'bn'
              ? 'প্রতিটি উত্তর সরকারি রেকর্ডের সঠিক উদ্ধৃতি দিয়ে সমর্থিত — কোনো উত্তরই বানোয়াট নয়।'
              : 'Every answer is grounded in real government records with exact citations — nothing is fabricated.'}
          </p>
        </section>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-semibold">
            {language === 'bn' ? 'আমরা কীভাবে কাজ করি' : 'How it works'}
          </h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              {language === 'bn'
                ? 'একটি স্ক্রেপার প্রতিদিন eprocure.gov.bd থেকে নতুন চুক্তি সংগ্রহ করে।'
                : 'A scraper crawls new contracts from eprocure.gov.bd nightly.'}
            </li>
            <li>
              {language === 'bn'
                ? 'চুক্তিগুলোর টেক্সট Vectorize-এ এমবেড করা হয় (BAAI/bge-m3 মডেল, 1024-ডাইম)।'
                : 'Contract text is embedded into Vectorize (BAAI/bge-m3, 1024-dim).'}
            </li>
            <li>
              {language === 'bn'
                ? 'আমাদের AI প্রতিটি চুক্তির পরিমাণ ও ক্রয় পদ্ধতির জন্য z-score অসঙ্গতি গণনা করে।'
                : 'Our AI computes z-score anomalies on contract amount and procurement method.'}
            </li>
            <li>
              {language === 'bn'
                ? 'আপনি একটি প্রশ্ন জিজ্ঞেস করলে, সিস্টেম সেমান্টিক অনুসন্ধান (Vectorize) এবং কীওয়ার্ড অনুসন্ধান (D1 FTS5) একত্রিত করে — Reciprocal Rank Fusion — সবচেয়ে প্রাসঙ্গিক চুক্তিগুলো খোঁজে।'
                : 'When you ask a question, the system fuses semantic search (Vectorize) with keyword search (D1 FTS5) using Reciprocal Rank Fusion to find the most relevant contracts.'}
            </li>
            <li>
              {language === 'bn'
                ? 'একটি LLM (Llama 3.1 8B Workers AI-তে) প্রাপ্ত চুক্তিগুলোর উপর ভিত্তি করে একটি উত্তর তৈরি করে — প্রতিটি দাবি সরকারি রেকর্ডের একটি উদ্ধৃতি দিয়ে সমর্থিত।'
                : 'An LLM (Llama 3.1 8B on Workers AI) generates a grounded answer — every claim is backed by a citation to a government record.'}
            </li>
          </ol>
        </section>

        <section className="mb-8 space-y-2">
          <h2 className="text-lg font-semibold">
            {language === 'bn' ? 'প্রযুক্তি' : 'Stack'}
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Cloudflare Workers + D1 + Vectorize + R2 + Workers AI + Queues</li>
            <li>Next.js 16 + React 19 + Tailwind + shadcn/ui (frontend)</li>
            <li>Scrapy (Python) for the e-GP scraper</li>
            <li>BAAI/bge-m3 multilingual embeddings (BN + EN)</li>
            <li>Llama 3.1 8B (Workers AI) for answer generation</li>
          </ul>
        </section>

        <section className="mb-8 space-y-2">
          <h2 className="text-lg font-semibold">
            {language === 'bn' ? 'সীমাবদ্ধতা' : 'Limitations'}
          </h2>
          <p>
            {language === 'bn'
              ? 'বাংলা FTS5 টোকেনাইজেশনের সীমাবদ্ধতার কারণে, কিছু বাংলা প্রশ্নের জন্য কীওয়ার্ড মিল কম হতে পারে — তবে সেমান্টিক অনুসন্ধান এই অনুপস্থিতিগুলো কভার করে। চুক্তির পরিমাণ কেবল e-GP পোর্টালে প্রকাশিত তথ্যের উপর ভিত্তি করে — এটি প্রকৃত চূড়ান্ত অর্থায়ন থেকে আলাদা হতে পারে।'
              : 'Due to FTS5 tokenization limitations for Bangla, some Bangla queries may have weaker keyword matches — but semantic search covers these gaps. Contract amounts reflect only what eprocure.gov.bd has published, which may differ from actual disbursements.'}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">
            {language === 'bn' ? 'ডেটা সোর্স' : 'Data sources'}
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <a
                href="https://www.eprocure.gov.bd"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                eprocure.gov.bd
              </a>{' '}
              — Central e-Government Procurement portal
            </li>
          </ul>
        </section>
      </main>

      <GovWatchFooter language={language} />
    </div>
  )
}
