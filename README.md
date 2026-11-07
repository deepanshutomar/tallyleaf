# Tallyleaf

**A paper-to-data research tool.** Build a questionnaire, print numbered copies, photograph the filled pile in any order, and get a spreadsheet with your column names, value labels and subscale scores. It runs entirely in the browser: no account, no server, and participant data never leaves the device.

Made for psychology students who have spent a weekend typing questionnaires into SPSS.

## What it does

1. **Build**: rating scales (Likert grids), single choice, tick-all-that-apply, numbers/codes (digit bubbles), open answers, headings, instructions and page breaks. Each question gets a column name, stored values, reverse-scoring and a subscale. A live preview shows the real printed pages.
2. **Print**: an A4 PDF of numbered copies. Every page carries four corner squares, a QR code (project, layout version, participant ID, page) and the ID in print. IDs continue across batches; teammates can reserve their own ID ranges.
3. **Scan**: phone photos or scanner PDFs, shuffled, mixed participants, any page order. Each page is straightened, matched to its participant and read. Faint, doubled or skipped marks are flagged with a picture of the original.
4. **Data**: check flagged answers, then export Excel (data, codebook, corrections log), a self-contained SPSS syntax file with every label, or CSV for R.

## Run it

```bash
npm install
npm run dev        # local development
npm run build      # static site in dist/, host it anywhere (GitHub Pages, Netlify, any web server)
npm test           # unit and end-to-end tests
```

## How the scanning works

- The QR code says which project, layout version, participant and page a sheet is, so order never matters.
- The four corner squares give a perspective transform (homography) from the printed page to the photo. Alignment is accepted only if the printed bubble outlines line up where expected, so a misaligned photo fails loudly instead of giving wrong answers.
- Each bubble is scored by the darkness of its centre and the amount of ink inside it, relative to the paper around it. That handles filled circles, ticks, crosses, pencil and coloured pens.
- Bubble positions are stored in the project file when you print, so the scanner never has to guess the layout.

## The project file

`.tallyleaf` files hold the questions, every printed batch and every scanned answer (including pictures of handwriting, so store them like research data). Send it to a teammate to scan the other half of the pile, then merge. Every generated PDF also embeds the questions and print history, so a lost project file can be recovered from any printed PDF.

## Known limits

- Tested on simulated photos only so far; a field validation on real sheets is planned.
- The PDF font covers Latin characters; Hindi and other scripts are planned.
- Handwriting is not read automatically; you type open answers while looking at the picture.

## Contributing

Issues and pull requests are welcome. Please run `npm test` before submitting.

## License

MIT © Deepanshu Tomar. Made with ♥ · [Instagram](https://www.instagram.com/deepanshutomarg) · [YouTube](https://www.youtube.com/@DeepanshuTomarJi) · [deepanshutomar.in](https://deepanshutomar.in)
