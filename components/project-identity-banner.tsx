export function ProjectIdentityBanner() {
  return (
    <div className="sticky top-0 z-40 border-b border-border bg-white">
      <div className="mx-auto max-w-screen-2xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex min-h-[72px] items-center justify-between gap-6">
          <img
            src="/identity/cofinantat-ue.png"
            alt="Cofinanțat de Uniunea Europeană"
            className="h-[52px] max-w-[70vw] object-contain sm:h-[68px]"
            loading="eager"
            decoding="sync"
          />
          <img
            src="/identity/guvernul-romaniei.jpg"
            alt="Guvernul României"
            className="h-[52px] w-[52px] shrink-0 object-contain sm:h-[68px] sm:w-[68px]"
            loading="eager"
            decoding="sync"
          />
        </div>

        <div className="mt-4 rounded-md border border-border bg-secondary px-4 py-3 text-center">
          <p className="text-sm font-semibold text-foreground sm:text-base">
            Titlul proiectului: „Consolidarea capacității Concordia pentru dialog social”
          </p>
          <p className="mt-1 text-sm font-semibold text-primary">Cod SMIS: 302141</p>
        </div>
      </div>
    </div>
  );
}
