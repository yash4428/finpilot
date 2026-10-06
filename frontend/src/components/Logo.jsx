export function Mark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#0B2A2E" />
      <path d="M7 21h18" stroke="#2C5C5F" strokeWidth="3" strokeLinecap="round" />
      <path d="M7 21h11" stroke="#F2A33A" strokeWidth="3" strokeLinecap="round" />
      <path d="M10 15.5l5.5-5 2 2 4.5-3.5" stroke="#7FE0C2" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
