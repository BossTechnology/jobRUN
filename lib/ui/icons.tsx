/* SVG path data, copied verbatim from public/prototype.html (ICONS). Render with <Icon d={...} />. */
export const STAGE_IC: string[]=[
 '<path d="M6 3h12M6 21h12"/><path d="M7.5 3v2.2a4.5 4.5 0 0 0 2 3.7L12 10.5l2.5-1.6a4.5 4.5 0 0 0 2-3.7V3M7.5 21v-2.2a4.5 4.5 0 0 1 2-3.7l2.5-1.6 2.5 1.6a4.5 4.5 0 0 1 2 3.7V21"/>',
 '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M9 15.2l2 2 4-4"/>',
 '<path d="M8.5 21h7a1 1 0 0 0 1-1v-7.6L14.4 9H9.6l-2.1 3.4V20a1 1 0 0 0 1 1z"/><path d="M10.2 9V5.6h5.3V9"/><path d="M15.5 6.4l3-1.2M20 3.6h.01M21 7h.01M19.6 9.6h.01"/>',
 '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M9 13l2 2 4-4"/>',
 '<path d="M12 3l7 3v5.2c0 4.4-3 7.9-7 9.8-4-1.9-7-5.4-7-9.8V6z"/><path d="M9 12l2 2 4-4"/>'];
export const TYPE_IC: Record<string, string>={mf:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10.5 21v-3h3v3"/>',
 st:'<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4"/><path d="M21 9v5"/>',
 co:'<path d="M4 21h16"/><path d="M6 21V8l6-4 6 4v13"/><path d="M10 21v-4h4v4M9 10h.01M15 10h.01M9 13h.01M15 13h.01"/>',
 re:'<path d="M4 10v10h16V10"/><path d="M3 10l2-6h14l2 6"/><path d="M3 10c0 1.4 1.3 2.5 3 2.5S9 11.4 9 10c0 1.4 1.3 2.5 3 2.5s3-1.1 3-2.5c0 1.4 1.3 2.5 3 2.5s3-1.1 3-2.5M10 20v-5h4v5"/>'};
export const SVC_IC: string[]=['<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L19 4M16 7l2 2M14 9l2 2"/>',
 '<path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
 '<path d="M4 17h16v-2a8 8 0 0 0-16 0z"/><path d="M12 7v5M9 8.5V12M15 8.5V12M3 17h18"/>',
 '<path d="M6 11V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/><path d="M4 11a2 2 0 0 1 2 2v2h12v-2a2 2 0 1 1 4 0v4H2v-4a2 2 0 0 1 2-2zM5 17v2M19 17v2"/>',
 '<path d="M3 18V7M3 13h18v5M21 18v-3a3 3 0 0 0-3-3h-7v1"/><circle cx="7" cy="10" r="1.6"/>',
 '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>'];
export const TYPE_SHORT: Record<"en" | "es", Record<string, string>>={en:{mf:'Multifam.',st:'Student',co:'Commercial',re:'Retail'},es:{mf:'Multifam.',st:'Estudiantil',co:'Comercial',re:'Retail'}};
export const SVC_SHORT: Record<"en" | "es", string[]>={en:['Turnover','Deep clean','Post-const.','Common','Guest suite','Porter'],es:['Rotación','Profunda','Post-const.','Comunes','Huéspedes','Portería']};
export const MSG_IC='<path d="M12 3.2a8.8 8.8 0 0 1 0 17.6 8.7 8.7 0 0 1-4.4-1.2L3.2 21l1.5-4.4A8.8 8.8 0 0 1 12 3.2z"/><circle cx="8.3" cy="12" r="1.05" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.05" fill="currentColor" stroke="none"/><circle cx="15.7" cy="12" r="1.05" fill="currentColor" stroke="none"/>';
export const P={
 person:'<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c1-3.6 4-5.2 7.2-5.2s6.2 1.6 7.2 5.2"/>',
 team:'<circle cx="9" cy="8.5" r="3"/><circle cx="17" cy="9.5" r="2.4"/><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M15.2 14.8c2.4-.3 4.5 1 5.3 4.2"/>',
 cal:'<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
 pin:'<path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
 cam:'<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.2"/>',
 usd:'<path d="M15.5 8c-.6-1.2-2-1.8-3.5-1.8-2 0-3.5 1-3.5 2.5s1.5 2.1 3.5 2.6 3.5 1.1 3.5 2.7-1.5 2.6-3.5 2.6c-1.6 0-3-.7-3.6-1.9M12 3.8v16.4"/>',
 check:'<path d="M5 12.5l4.2 4.2L19 7"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
 chat:'<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
 flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
 bolt:'<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
 map:'<path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
 bldg:'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10.5 21v-3h3v3"/>',
 tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.3"/>',
 stage:'<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'
};

/* Additions: the prototype had no single-family entries (220 PINCH properties rendered a blank type),
   and labelled "re" as Retail although the PINCH export says residential. */
TYPE_IC.sf = '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>';
TYPE_SHORT.en.sf = "Single fam.";
TYPE_SHORT.es.sf = "Unifam.";
TYPE_SHORT.en.re = "Residential";
TYPE_SHORT.es.re = "Residencial";

export function Icon({ d, sw = 1.6 }: { d: string; sw?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />
  );
}
