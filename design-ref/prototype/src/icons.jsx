// Custom inline SVG icons — single stroke 1.6 weight, rounded caps
// All icons take {size=20, className=''}
const Ic = (path, viewBox = "0 0 24 24") => ({ size = 20, className = "", strokeWidth = 1.7 }) =>
  <svg width={size} height={size} viewBox={viewBox} fill="none" stroke="currentColor"
       strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {path}
  </svg>;

const I = {
  Home:       Ic(<><path d="M4 11.5 12 4.5l8 7"/><path d="M6 10.5V20h4v-5h4v5h4v-9.5"/></>),
  Folder:     Ic(<><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2H19.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/></>),
  Users:      Ic(<><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 3-4.6 5.5-4.6S14 16 14.5 19"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.4c2 .3 4 1.4 4.5 4"/></>),
  Hammer:     Ic(<><path d="M14.5 4.5l5 5-2 2-5-5z"/><path d="M12.5 6.5 3.5 15.5l3 3 9-9"/></>),
  Calendar:   Ic(<><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></>),
  Wallet:     Ic(<><path d="M3.5 8a2 2 0 0 1 2-2H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z"/><path d="M16 13h2.5"/><path d="M3.5 9.5h13.6a1 1 0 0 1 1 1V14"/></>),
  Message:    Ic(<><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4 3v-3h-.5A2.5 2.5 0 0 1 3 14.5z" transform="translate(0.5,0.5)"/></>),
  Chart:      Ic(<><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4M12 15V8M16 15v-6"/></>),
  Settings:   Ic(<><circle cx="12" cy="12" r="3"/><path d="M19.4 14.5 18 13.7c.1-.6.1-1.3 0-1.9l1.4-.8a.7.7 0 0 0 .3-.9l-1.4-2.4a.7.7 0 0 0-.9-.3l-1.4.5a6.7 6.7 0 0 0-1.6-1L14 4.6a.7.7 0 0 0-.7-.6h-2.7a.7.7 0 0 0-.7.6l-.4 1.4a6.7 6.7 0 0 0-1.6 1L6.6 6.5a.7.7 0 0 0-.9.3L4.3 9.1a.7.7 0 0 0 .3.9l1.4.8c-.1.6-.1 1.3 0 1.9l-1.4.8a.7.7 0 0 0-.3.9l1.4 2.4a.7.7 0 0 0 .9.3l1.4-.5a6.7 6.7 0 0 0 1.6 1l.4 1.4a.7.7 0 0 0 .7.6h2.7a.7.7 0 0 0 .7-.6l.4-1.4a6.7 6.7 0 0 0 1.6-1l1.4.5a.7.7 0 0 0 .9-.3l1.4-2.4a.7.7 0 0 0-.3-.9z"/></>),
  Search:     Ic(<><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/></>),
  Bell:       Ic(<><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5z"/><path d="M9.5 19.5a2.5 2.5 0 0 0 5 0"/></>),
  Plus:       Ic(<><path d="M12 5v14M5 12h14"/></>),
  Filter:     Ic(<><path d="M4 5h16l-6 8v6l-4-2v-4z"/></>),
  ChevronRight:Ic(<><path d="m9 5 7 7-7 7"/></>),
  ChevronLeft: Ic(<><path d="m15 5-7 7 7 7"/></>),
  ChevronDown: Ic(<><path d="m5 9 7 7 7-7"/></>),
  ChevronUp:   Ic(<><path d="m5 15 7-7 7 7"/></>),
  Arrow:       Ic(<><path d="M5 12h14M13 6l6 6-6 6"/></>),
  Pin:         Ic(<><path d="M15 4l5 5-4 1-3 7-2-2-4 4 1-5-2-2 7-3z"/></>),
  More:        Ic(<><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></>),
  Pin2:        Ic(<><path d="M14 4v6l3 3h-4v6l-1 1-1-1v-6H7l3-3V4z"/></>),
  Sparkles:    Ic(<><path d="M12 4v4M12 16v4M4 12h4M16 12h4M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/></>),
  Check:       Ic(<><path d="m5 12 5 5L20 7"/></>),
  X:           Ic(<><path d="M6 6l12 12M18 6 6 18"/></>),
  Alert:       Ic(<><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5" strokeWidth="2"/></>),
  Clock:       Ic(<><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></>),
  Phone:       Ic(<><path d="M5 4h3l2 5-2 1a11 11 0 0 0 6 6l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></>),
  Mail:        Ic(<><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/></>),
  Pin3:        Ic(<><path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="9.5" r="2.4"/></>),
  Doc:         Ic(<><path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5V8h4"/><path d="M8 12.5h8M8 16h6"/></>),
  Building:    Ic(<><path d="M4 21V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15"/><path d="M15 21V11h4a2 2 0 0 1 2 2v8"/><path d="M8 8h3M8 12h3M8 16h3M18 15h.5M18 18h.5"/></>),
  Tag:         Ic(<><path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l8.5 8.5a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.5"/></>),
  Coins:       Ic(<><ellipse cx="8" cy="8" rx="5" ry="2.5"/><path d="M3 8v3c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V8"/><ellipse cx="16" cy="15" rx="5" ry="2.5"/><path d="M11 15v3c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-3"/></>),
  TrendUp:     Ic(<><path d="m4 16 5-5 4 3 7-8"/><path d="M15 6h5v5"/></>),
  TrendDown:   Ic(<><path d="m4 8 5 5 4-3 7 8"/><path d="M15 18h5v-5"/></>),
  Eye:         Ic(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>),
  Euro:        Ic(<><path d="M18 7a7 7 0 1 0 0 10"/><path d="M5 10h9M5 14h9"/></>),
};

window.I = I;
