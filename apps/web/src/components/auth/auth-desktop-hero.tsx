import {
  CheckCircle2,
  HeartHandshake,
  QrCode,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { MosaicHeroOverlay } from '@/components/ui/green-pattern-overlay';

interface AuthDesktopHeroProps {
  className?: string;
}

const HIGHLIGHTS = [
  {
    icon: HeartHandshake,
    title: 'Zakat, Wakaf, Infak & Qurban Terpadu',
    description:
      'Tunaikan kewajiban dan amal jariyah dalam satu ekosistem digital terpercaya dengan kalkulator zakat otomatis.',
  },
  {
    icon: QrCode,
    title: 'Pelacakan Real-Time & Sertifikat Digital',
    description:
      'Dapatkan update penyaluran dana transparan dan Sertifikat Wakaf Uang (SWU) digital berstandar BWI seketika.',
  },
  {
    icon: Sparkles,
    title: 'Poin Berkah & Dampak Berkelanjutan',
    description:
      'Kumpulkan poin kebaikan dari setiap transaksi dan raih keberkahan bersama ribuan donatur lainnya.',
  },
] as const;

/**
 * Reusable Auth Hero Component for desktop screens (50% left column).
 * Harmonized with Amwal primary brand color (#356152 to #1d352d gradient).
 */
export const AuthDesktopHero = ({ className = '' }: AuthDesktopHeroProps) => {
  return (
    <aside
      aria-label="Informasi Platform Amwal"
      className={`relative isolate hidden min-h-screen flex-col justify-between overflow-hidden bg-gradient-to-br from-[#356152] via-[#2b4f43] to-[#1d352d] p-10 text-white lg:flex lg:w-1/2 xl:p-14 ${className}`}
    >
      {/* Islamic mosaic, faded out behind the copy on the left */}
      <MosaicHeroOverlay />

      {/* Top Header: Brand Logo */}
      <div className="relative z-10">
        {/** biome-ignore lint/performance/noImgElement: official Amwal white horizontal branding */}
        <img
          alt="Amwal Platform ZISWAF & Wakaf Produktif"
          className="h-10 w-auto object-contain drop-shadow-sm"
          src="/assets/images/amwal-logo-white-h.png"
        />
      </div>

      {/* Center Content: Headline & Value Highlights */}
      <div className="relative z-10 my-auto py-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3.5 py-1 font-semibold text-white text-xs backdrop-blur-sm">
          <Sparkles aria-hidden="true" className="size-3.5 text-amber-300" />
          <span>Platform Kebaikan &amp; Wakaf Uang Digital</span>
        </div>

        <h1 className="mb-4 font-extrabold text-3xl text-white leading-tight tracking-tight lg:text-4xl xl:text-5xl">
          Berbagi Kebaikan dalam Satu Platform.
        </h1>

        <p className="mb-8 max-w-lg text-sm text-white/90 leading-relaxed lg:text-base">
          Amwal menghadirkan kemudahan berzakat, berwakaf produktif, infak, dan
          berqurban secara amanah, transparan, dan terukur.
        </p>

        {/* Feature List */}
        <div className="space-y-5">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                className="flex items-start gap-3.5 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm transition-colors hover:bg-white/15"
                key={item.title}
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white shadow-inner">
                  <Icon aria-hidden="true" className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-sm text-white lg:text-base">
                      {item.title}
                    </h2>
                    <CheckCircle2
                      aria-hidden="true"
                      className="size-4 shrink-0 text-white"
                    />
                  </div>
                  <p className="mt-1 text-white/80 text-xs leading-relaxed lg:text-sm">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Footer: Compliance & Legality Badges */}
      <div className="relative z-10 border-white/15 border-t pt-6">
        <div className="flex flex-col gap-2 text-white/85 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck
              aria-hidden="true"
              className="size-4 shrink-0 text-white"
            />
            <span className="font-medium">
              Aman &amp; Sesuai Syariah • Terdaftar BWI • Diawasi DPS
            </span>
          </div>
          <span className="text-[11px] text-white/60">
            © 2026 Amwal · Platform Islamic Social Finance
          </span>
        </div>
      </div>
    </aside>
  );
};
