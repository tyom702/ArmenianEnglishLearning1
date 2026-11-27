import { AppLanguage } from '../types';

export const DEFAULT_SEO_TITLE = 'HayEnglish - Armenian English Learning';
export const DEFAULT_SEO_DESCRIPTION =
  'Modern Armenian-English learning platform with student progress dashboard, XP and level tracking, daily streaks, CEFR lesson mastery, and native Armenian explanations.';

export const SEO_KEYWORDS_HY =
  'HayEnglish, անգլերենի ուսուցում, սովորել անգլերեն, անգլերեն հայերեն, անգլերեն սկսնակների համար, անգլերեն դասեր օնլայն, անգլերեն քերականություն հայերեն, անգլերեն բառարան, անգլերեն արտասանություն, անգլերեն թեստեր';
export const SEO_KEYWORDS_EN =
  'HayEnglish, learn English in Armenian, Armenian English learning, English lessons for Armenians, English grammar in Armenian, Armenian English dictionary, English pronunciation for Armenians, ESL Armenian';

export const PRIVATE_TABS = new Set(['dashboard', 'review', 'leaderboard']);
export const PRIVATE_PATH_PATTERN = /^\/(admin|dashboard|profile|review|leaderboard|api)(\/|$)/i;

export interface SeoMetadataConfig {
  title: string;
  description: string;
  keywords: string;
  robots: string;
  isPrivate: boolean;
}

export function getSeoConfigForView(params: {
  appLang: AppLanguage;
  isAuthenticated: boolean;
  activeTab: string;
  isPrivateModalOpen?: boolean;
  pathname?: string;
}): SeoMetadataConfig {
  const { appLang, isAuthenticated, activeTab, isPrivateModalOpen = false, pathname = '/' } = params;

  const isPrivateRoute = PRIVATE_PATH_PATTERN.test(pathname);
  const isPrivateTab = isAuthenticated && PRIVATE_TABS.has(activeTab);
  const isPrivate = Boolean(isPrivateModalOpen || isPrivateRoute || isPrivateTab);

  const keywords = `${SEO_KEYWORDS_HY}, ${SEO_KEYWORDS_EN}`;

  if (isPrivate) {
    return {
      title:
        activeTab === 'dashboard'
          ? appLang === 'hy'
            ? 'Անձնական վահանակ | HayEnglish'
            : 'Student Dashboard | HayEnglish'
          : activeTab === 'review'
          ? appLang === 'hy'
            ? 'Անհատական կրկնություն | HayEnglish'
            : 'Personal Review | HayEnglish'
          : activeTab === 'leaderboard'
          ? appLang === 'hy'
            ? 'Առաջատարների ցուցակ | HayEnglish'
            : 'Leaderboard | HayEnglish'
          : DEFAULT_SEO_TITLE,
      description: DEFAULT_SEO_DESCRIPTION,
      keywords,
      robots: 'noindex, nofollow, noarchive',
      isPrivate: true,
    };
  }

  if (!isAuthenticated || activeTab === 'lessons') {
    return {
      title:
        appLang === 'hy'
          ? 'HayEnglish – Անգլերենի ուսուցում հայախոսների համար'
          : DEFAULT_SEO_TITLE,
      description:
        appLang === 'hy'
          ? 'Սովորեք անգլերեն հայերեն բացատրություններով՝ ինտերակտիվ դասեր, քերականություն, արտասանություն, բառարան, թեստեր և XP համակարգ HayEnglish-ում:'
          : DEFAULT_SEO_DESCRIPTION,
      keywords,
      robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      isPrivate: false,
    };
  }

  const tabMeta: Record<string, { titleHy: string; titleEn: string; descHy: string; descEn: string }> = {
    library: {
      titleHy: 'Հայ-Անգլերեն բառարան և արտասանություն | HayEnglish',
      titleEn: 'Armenian-English Vocabulary Library | HayEnglish',
      descHy:
        'Անգլերեն-հայերեն բառապաշար հայերեն տառադարձությամբ, օրինակ նախադասություններով և աուդիո արտասանությամբ:',
      descEn:
        'Explore the Armenian-English vocabulary library with phonetic guides, example sentences, and audio pronunciation.',
    },
    'listen-speak': {
      titleHy: 'Անգլերենի լսողություն և արտասանություն | HayEnglish',
      titleEn: 'English Listening & Pronunciation Practice | HayEnglish',
      descHy:
        'Զարգացրեք անգլերեն լսողական ըմբռնումը և արտասանությունը W/V, TH հնչյունների հատուկ վարժություններով:',
      descEn:
        'Practice English listening comprehension and pronunciation tailored for Armenian speakers.',
    },
    quiz: {
      titleHy: 'Անգլերենի ինտերակտիվ թեստեր | HayEnglish',
      titleEn: 'Interactive English Quizzes | HayEnglish',
      descHy:
        'Ստուգեք անգլերենի ձեր գիտելիքները թեստերի միջոցով, ստացեք հայերեն բացատրություններ և վաստակեք XP:',
      descEn:
        'Test your English grammar and vocabulary with instant Armenian explanations and XP rewards.',
    },
    vocabulary: {
      titleHy: 'Անգլերեն բառաքարտեր հայերեն թարգմանությամբ | HayEnglish',
      titleEn: 'English Flashcards for Armenians | HayEnglish',
      descHy:
        'Հիշեք անգլերեն բառերը արագ ինտերակտիվ բառաքարտերով, տառադարձությամբ և աուդիո հնչողությամբ:',
      descEn:
        'Memorize essential English words faster with bilingual Armenian-English flashcards and audio.',
    },
    'false-friends': {
      titleHy: 'Անգլերեն թակարդ բառեր (False Friends) | HayEnglish',
      titleEn: 'English False Friends for Armenian Speakers | HayEnglish',
      descHy:
        'Խուսափեք տարածված սխալներից՝ սովորելով հայերենին ու ռուսերենին նման, բայց այլ իմաստ ունեցող անգլերեն բառերը:',
      descEn:
        'Avoid common English vocabulary traps caused by misleading Armenian and Russian cognates.',
    },
    'sentence-builder': {
      titleHy: 'Անգլերեն նախադասության կառուցիչ | HayEnglish',
      titleEn: 'English Sentence Builder | HayEnglish',
      descHy:
        'Սովորեք անգլերեն բառերի ճիշտ դասավորությունը ինտերակտիվ նախադասություններ կազմելով:',
      descEn:
        'Master English word order and sentence structure through interactive phrase building.',
    },
    dialogues: {
      titleHy: 'Անգլերեն խոսակցական երկխոսություններ | HayEnglish',
      titleEn: 'Practical English Dialogues | HayEnglish',
      descHy:
        'Կենդանի անգլերեն երկխոսություններ հայերեն թարգմանությամբ՝ ճամփորդության, աշխատանքի և առօրյայի համար:',
      descEn:
        'Practice real-world English conversations with side-by-side Armenian translations and audio.',
    },
    idioms: {
      titleHy: 'Անգլերեն իդիոմներ և հայկական համարժեքներ | HayEnglish',
      titleEn: 'English Idioms & Armenian Equivalents | HayEnglish',
      descHy:
        'Սովորեք անգլերեն տարածված դարձվածքները և նրանց հայկական իմաստային համարժեքները:',
      descEn:
        'Discover common English idioms alongside their natural Armenian cultural equivalents.',
    },
  };

  const selected = tabMeta[activeTab];
  return {
    title: selected ? (appLang === 'hy' ? selected.titleHy : selected.titleEn) : DEFAULT_SEO_TITLE,
    description: selected
      ? appLang === 'hy'
        ? selected.descHy
        : selected.descEn
      : DEFAULT_SEO_DESCRIPTION,
    keywords,
    robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
    isPrivate: false,
  };
}

function upsertMetaTag(attr: 'name' | 'property', key: string, content: string): void {
  if (typeof document === 'undefined' || !document.head) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonicalLink(href: string): void {
  if (typeof document === 'undefined' || !document.head) return;
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

export function applySeoMetadata(params: {
  appLang: AppLanguage;
  isAuthenticated: boolean;
  activeTab: string;
  isPrivateModalOpen?: boolean;
}): SeoMetadataConfig {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  const config = getSeoConfigForView({ ...params, pathname });

  if (typeof document === 'undefined') {
    return config;
  }

  document.documentElement.lang = params.appLang === 'hy' ? 'hy' : 'en';
  document.title = config.title;

  upsertMetaTag('name', 'description', config.description);
  upsertMetaTag('name', 'keywords', config.keywords);
  upsertMetaTag('name', 'robots', config.robots);
  upsertMetaTag('name', 'googlebot', config.isPrivate ? 'noindex, nofollow' : 'index, follow');

  upsertMetaTag('property', 'og:title', config.title);
  upsertMetaTag('property', 'og:description', config.description);
  upsertMetaTag('property', 'og:locale', params.appLang === 'hy' ? 'hy_AM' : 'en_US');

  upsertMetaTag('name', 'twitter:title', config.title);
  upsertMetaTag('name', 'twitter:description', config.description);

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    const canonicalUrl = `${origin}/`;
    const ogImageUrl = `${origin}/og-image.jpg`;

    upsertCanonicalLink(canonicalUrl);
    upsertMetaTag('property', 'og:url', canonicalUrl);
    upsertMetaTag('property', 'og:image', ogImageUrl);
    upsertMetaTag('name', 'twitter:image', ogImageUrl);
  }

  const gscToken = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_GOOGLE_SITE_VERIFICATION?.trim();
  if (gscToken) {
    upsertMetaTag('name', 'google-site-verification', gscToken);
  }

  return config;
}
