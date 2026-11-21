// Display cleanup for Egyptian census (CAPMAS) place names: «قريه X» → «X», final ه → ة, final ى → ي,
// hamza on well-known names, tidy spaces. The raw name is always kept alongside.
const FIX = {
  'اول': 'أول', 'ثان': 'ثاني', 'ثالث': 'ثالث', 'رابع': 'رابع',
  'ابشواي': 'أبشواي', 'اطسا': 'إطسا', 'ابجيج': 'أبجيج', 'ابهيت': 'أبهيت', 'ابو': 'أبو', 'ابوكساه': 'أبوكساه', 'منشاه': 'منشأة', 'منشاة': 'منشأة',
};
const KEEP_HA = new Set(['الله', 'وجه', 'فقيه', 'اخوه', 'ابوه']);

export function cleanName(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[\t ]+/g, ' ').replace(/\s*\(\s*/g, ' (').replace(/\s*\)\s*/g, ') ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^(قريه|قرية)\s+/, '');
  s = s.split(' ').map(w => {
    const bare = w.replace(/[()]/g, '');
    let x = bare;
    // ه → ة only for feminine endings; names like أبوكساه / شدموه (ه after ا or و) keep their ه
    if (x.length > 2 && x.endsWith('ه') && !KEEP_HA.has(x) && !/[او]ه$/.test(x)) x = x.slice(0, -1) + 'ة';
    if (x.length > 2 && x.endsWith('ى')) x = x.slice(0, -1) + 'ي';
    x = FIX[x] || x;
    return w.replace(bare, x);
  }).join(' ');
  if (s.includes('(') && !s.includes(')')) s += ')';
  return s.replace(/\s+\)/g, ')').trim();
}
