/** The assistant's face: used on the launcher and in the panel header (colours come from CSS). */
export default function BotIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path className="bot-antenna" d="M16 3.5v3.2" />
      <circle className="bot-antenna-tip" cx="16" cy="3.2" r="1.7" />
      <rect className="bot-head" x="5" y="7.5" width="22" height="17" rx="7" />
      <circle className="bot-eye" cx="11.8" cy="15.3" r="2" />
      <circle className="bot-eye" cx="20.2" cy="15.3" r="2" />
      <path className="bot-smile" d="M12.5 19.6c1.9 1.5 5.1 1.5 7 0" />
      <path className="bot-ear" d="M3.2 13.5v5M28.8 13.5v5" />
      <path className="bot-tail" d="M10.5 24.5l-1.6 4.2 5.3-4.2" />
    </svg>
  );
}
