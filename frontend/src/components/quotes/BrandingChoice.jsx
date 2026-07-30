import { cn } from '../../lib/cn';

const OPTIONS = [
  {
    value: 'OWN',
    title: 'My Company Branding',
    subtitle: 'White-label',
    description: 'Your logo and company details appear on the quote. TravNexa is not mentioned.',
  },
  {
    value: 'EMV',
    title: 'TravNexa Branding',
    subtitle: 'Reference quote',
    description: "TravNexa Global's branding appears on the quote document.",
  },
];

/** Two-card radio choice for Quote.branding — defaults to OWN, the core white-label use case. */
function BrandingChoice({ value, onChange }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
            className={cn(
              'rounded-xl border-2 p-4 text-left transition-colors',
              selected
                ? 'border-primary-600 bg-primary-50'
                : 'border-neutral-200 bg-white hover:border-neutral-300'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-900">{opt.title}</span>
              <span
                className={cn(
                  'flex h-5 w-5 flex-none items-center justify-center rounded-full border-2',
                  selected ? 'border-primary-600 bg-primary-600' : 'border-neutral-300'
                )}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
            </div>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-primary-600">
              {opt.subtitle}
            </p>
            <p className="mt-2 text-sm text-neutral-600">{opt.description}</p>
          </button>
        );
      })}
    </div>
  );
}

export default BrandingChoice;
