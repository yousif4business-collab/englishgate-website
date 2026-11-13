# English Gate — brand exports

**⚠️ No vector master exists.** Verified 2026-07-07: the entire repo and its
full git history contain no `.ai`/`.eps`/`.pdf`/`.svg` of the logo and no
raster larger than what's listed below. The `*-NATIVE-*` files are the highest
true-quality logo assets we possess.

| file | status |
|---|---|
| `logo-shield-NATIVE-279x248.png` | ✅ native — the real ceiling for the icon |
| `logo-full-lockup-NATIVE-539x412.png` | ✅ native — the real ceiling for the lockup |
| `logo-full-lockup-512w-FROM-NATIVE-*.png` | ✅ true quality (downsampled from native) |
| `*-UPSCALED-NOT-NATIVE-*.png` (2x/4x + 512–4096w pack) | ⚠️ interpolated — soft edges, amplified artifacts; the larger the width, the worse; last resort for raster use |

Standard pack widths (512 / 1024 / 2048 / 4096) exist for both marks, but note
only the 512w lockup is native-derived — every icon size and every larger
lockup size exceeds the native source and is interpolation, as its filename
states. Regenerate everything with `node scripts/upscale-logo.mjs`.

The upscales are **not** suitable for print or large-format signage. For that,
get the original master from the academy (see request message below). When the
master arrives: put it in this folder, re-export true 512/1024/2048/4096
transparent PNGs from it, and delete the UPSCALED files + scripts/upscale-logo.mjs.

The SVG shields in `src/components/Mascot.jsx` and `src/components/Intro.jsx`
are stylized hand-drawn derivatives for animation — they are NOT the official
mark and must not be exported as the logo.

## Master request message (WhatsApp reception / academy designer)

**EN:**
> Hello! For the website and future printing we need the original English Gate
> logo file — the "master" version the designer created it in. Ideally the
> vector file (.ai, .eps, .svg, or .pdf), or otherwise the largest PNG that
> exists (2000px wide or more, transparent background if possible). Both the
> shield icon and the full logo with the school name. Could you ask whoever
> designed the logo to send those files? Thank you!

**AR:**
> مرحباً! نحتاج لموقع الأكاديمية وللطباعة مستقبلاً ملف شعار إنجليش جيت الأصلي —
> النسخة «الماستر» التي صمّمه بها المصمم. الأفضل ملف فيكتور (‎.ai أو ‎.eps أو
> ‎.svg أو ‎.pdf)، وإن لم يتوفر فأكبر نسخة PNG موجودة (بعرض ٢٠٠٠ بكسل أو أكثر،
> وبخلفية شفافة إن أمكن). نحتاج أيقونة الدرع وحدها والشعار الكامل مع اسم
> الأكاديمية. هل يمكن التواصل مع مصمم الشعار لإرسال هذه الملفات؟ شكراً جزيلاً!
