import { GlassButton } from "@/components/ui/glass-button";

const ZapIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const DottedBackground = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    style={{
      pointerEvents: 'none',
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      zIndex: 0,
    }}
  >
    <defs>
      <pattern
        patternUnits="userSpaceOnUse"
        height="30"
        width="30"
        id="dottedGrid"
      >
        <circle
          fill="rgba(0, 0, 0, 0.15)"
          r="1.5"
          cy="15"
          cx="15"
        ></circle>
      </pattern>
    </defs>
    <rect fill="url(#dottedGrid)" height="100%" width="100%"></rect>
  </svg>
);

const GlassButtonDemo = () => {
  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      height: '70vh',
      width: '100%',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '32px',
      background: '#f4f4f6',
      borderRadius: '24px',
      border: '1px solid rgba(0, 0, 0, 0.05)',
      padding: '40px',
      overflow: 'hidden',
      boxShadow: 'inset 0 0 40px rgba(0,0,0,0.02)'
    }}>
      <DottedBackground />
      <div style={{ zIndex: 10, textAlign: 'center' }}>
        <h2 style={{ marginBottom: '24px', fontSize: '24px', fontWeight: 700, color: '#1c1c1e', letterSpacing: '-0.5px' }}>
          Apple Tahoe Glass Buttons
        </h2>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
          marginTop: '16px'
        }}>
          <GlassButton
            size="sm"
          >
            Small
          </GlassButton>
          <GlassButton
            size="default"
            contentClassName="flex items-center gap-2"
          >
            <span>Generate</span>
            
            <ZapIcon className="h-5 w-5" style={{ width: '16px', height: '16px', color: '#b8860b' }} />
          </GlassButton>
          <GlassButton
            size="lg"
          >
            Submit
          </GlassButton>
          <GlassButton
            size="icon"
          >
            <ZapIcon className="h-5 w-5" style={{ width: '18px', height: '18px', color: '#007aff' }} />
          </GlassButton>
        </div>
      </div>
    </div>
  );
};

export default GlassButtonDemo;
