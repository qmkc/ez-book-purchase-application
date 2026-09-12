const LEGAL_LINKS = [
  { href: 'https://qmkc.dev/privacy-policy', label: '隱私權政策' },
  { href: 'https://qmkc.dev/terms-of-service', label: '服務條款' },
];

export function Footer() {
  return (
    <footer className="border-t border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-4 text-xs text-zinc-500 sm:px-6">
        {LEGAL_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-black hover:underline dark:hover:text-white"
          >
            {link.label}
          </a>
        ))}
      </div>
    </footer>
  );
}
