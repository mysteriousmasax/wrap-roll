import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import { readFileSync } from 'fs';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs');
const logoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/wrap-roll-logo-lockup-transparent.png');
const lightLogoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/wrap-roll-logo-light-transparent.png');
const heroPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/hero-food.jpg');
const brand = { red: 'B0003A', gold: 'D99A22', cream: 'FFF9F1', ink: '292522', muted: '786A62' };

function categoryLabel(value) {
  return String(value || 'Other').replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function groupItems(items) {
  return items.reduce((groups, item) => {
    const category = item.category || 'other';
    (groups[category] ||= []).push(item);
    return groups;
  }, {});
}

function price(item) {
  return `TZS ${Number(item.price || 0).toLocaleString()}`;
}

async function loadImageBuffer(source) {
  if (typeof source !== 'string' || !source) return null;
  try {
    if (source.startsWith('data:')) {
      const match = source.match(/^data:image\/[^;]+;base64,(.+)$/s);
      return match ? Buffer.from(match[1], 'base64') : null;
    }
    if (/^https?:\/\//i.test(source)) {
      const response = await fetch(source);
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    }
  } catch (error) {
    console.warn('Menu image could not be embedded:', error.message);
  }
  return null;
}

async function pdfBuffer(items) {
  return new Promise((resolve) => {
    const document = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    const groups = groupItems(items);
    const logo = readFileSync(logoPath);
    const hero = readFileSync(heroPath);
    const imageBuffers = new Map();

    Promise.all(items.map(async (item) => {
      const buffer = await loadImageBuffer(item.image);
      if (buffer) imageBuffers.set(item.id, buffer);
    })).then(() => {

    document.rect(0, 0, 595, 842).fill(`#${brand.cream}`);
    document.image(logo, 48, 48, { fit: [250, 68] });
    document.save();
    document.roundedRect(350, 55, 195, 285, 18).clip();
    document.image(imageBuffers.get(items.find((item) => item.image)?.id) || hero, 350, 55, { cover: [195, 285] });
    document.restore();
    document.fillColor(`#${brand.red}`).fontSize(11).font('Helvetica-Bold').text('THE WRAP & ROLL MENU BOOK', 48, 150);
    document.fillColor(`#${brand.ink}`).fontSize(34).font('Helvetica-Bold').text('Fresh food,\nmade your way.', 48, 178, { width: 350 });
    document.fillColor(`#${brand.muted}`).fontSize(12).font('Helvetica').text('A curated guide to wraps, rolls, salads, pizzas, burgers, combos, sides and drinks.', 48, 285, { width: 300, lineGap: 5 });
    document.roundedRect(48, 365, 220, 70, 12).fill(`#${brand.red}`);
    document.fillColor('#FFFFFF').fontSize(12).font('Helvetica-Bold').text('Wikicha Tower', 66, 386);
    document.font('Helvetica').fontSize(10).text('Mwai Kibaki Road, Dar es Salaam', 66, 405);
    document.fillColor(`#${brand.gold}`).fontSize(10).text('wrapandrolltz.com', 48, 770);
    document.fillColor(`#${brand.muted}`).fontSize(9).text('Always fresh. Always made for you.', 48, 787);

    let y = 54;
    let pageNumber = 1;
    const startMenuPage = () => {
      document.addPage({ size: 'A4', margin: 36 });
      pageNumber += 1;
      document.rect(0, 0, 595, 842).fill(`#${brand.cream}`);
      y = 54;
    };
    const drawCategoryHeading = (category, categoryIndex) => {
      document.fillColor(`#${brand.red}`).font('Helvetica-Bold').fontSize(9).text(`SECTION ${String(categoryIndex + 1).padStart(2, '0')}  /  WRAP & ROLL`, 42, y, { width: 510, align: 'right' });
      document.fillColor(`#${brand.ink}`).font('Helvetica-Bold').fontSize(23).text(categoryLabel(category), 42, y + 15);
      document.moveTo(42, y + 47).lineTo(553, y + 47).strokeColor(`#${brand.red}`).lineWidth(1.5).stroke();
      y += 64;
    };

    startMenuPage();
    Object.entries(groups).forEach(([category, categoryItems], categoryIndex) => {
      if (y > 690) startMenuPage();
      drawCategoryHeading(category, categoryIndex);
      categoryItems.forEach((item, index) => {
        if (index % 2 === 0 && y > 670) startMenuPage();
        const column = index % 2;
        const x = column ? 315 : 42;
        const rowY = y;
        document.roundedRect(x, rowY, 238, 112, 10).fill('#FFFFFF').stroke(`#EAD8C9`);
        const image = imageBuffers.get(item.id);
        if (image) document.image(image, x + 14, rowY + 14, { fit: [76, 76] });
        const contentX = image ? x + 102 : x + 14;
        const contentWidth = image ? 126 : 200;
        document.fillColor(`#${brand.ink}`).font('Helvetica-Bold').fontSize(12).text(item.name, contentX, rowY + 14, { width: contentWidth, height: 30, ellipsis: true });
        document.fillColor(`#${brand.red}`).fontSize(12).font('Helvetica-Bold').text(price(item), contentX, rowY + 48, { width: contentWidth, ellipsis: true });
        document.fillColor(`#${brand.muted}`).font('Helvetica').fontSize(9).text(item.description || 'Freshly prepared with Wrap & Roll ingredients.', contentX, rowY + 70, { width: contentWidth, height: 28, ellipsis: true });
        if (column === 1 || index === categoryItems.length - 1) y += 130;
      });
    });
    document.fillColor(`#${brand.muted}`).fontSize(8).text(`Prices are in Tanzanian Shillings. Ask our team about customizations and availability.  ·  Page ${pageNumber}`, 42, 805);
      document.end();
    });
  });
}

async function xlsxBuffer(items, modifiers) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Wrap & Roll';
  const sheet = workbook.addWorksheet('Menu Book');
  const logoId = workbook.addImage({ filename: logoPath, extension: 'png' });
  sheet.addImage(logoId, 'A1:C4');
  sheet.getCell('A6').value = 'WRAP & ROLL MENU BOOK';
  sheet.getCell('A7').value = 'Live menu catalog · Prices in TZS';
  sheet.addRow([]);
  sheet.addRow(['Food item', 'Category', 'Description', 'Price (TZS)', 'Prep time (min)', 'Featured', 'Available']);
  items.forEach((item) => sheet.addRow([item.name, categoryLabel(item.category), item.description || '', Number(item.price || 0), item.prep_time_minutes || 8, item.popular ? 'Yes' : 'No', item.active ? 'Yes' : 'No']));
  sheet.getRow(9).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand.red } };
  sheet.columns.forEach((column, index) => { column.width = [30, 20, 55, 16, 18, 14, 14][index]; });
  const modifierSheet = workbook.addWorksheet('Add-ons');
  modifierSheet.addRow(['Add-on', 'Price (TZS)', 'Type']);
  (modifiers || []).forEach((modifier) => modifierSheet.addRow([modifier.name, modifier.price, modifier.type]));
  modifierSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  modifierSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand.red } };
  modifierSheet.columns.forEach((column) => { column.width = 24; });
  return workbook.xlsx.writeBuffer();
}

async function docxBuffer(items) {
  const logo = await readFile(logoPath);
  const groups = groupItems(items);
  const children = [
    new Paragraph({ children: [new ImageRun({ data: logo, transformation: { width: 220, height: 62 } })] }),
    new Paragraph({ text: 'The Wrap & Roll Menu Book', heading: HeadingLevel.TITLE }),
    new Paragraph('Fresh food, made your way. Prices are in Tanzanian Shillings.'),
  ];
  Object.entries(groups).forEach(([category, categoryItems]) => {
    children.push(new Paragraph({ text: categoryLabel(category), heading: HeadingLevel.HEADING_1 }));
    children.push(new Table({ rows: [
      new TableRow({ children: ['Food item', 'Description', 'Price'].map((value) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: value, bold: true })] })] })) }),
      ...categoryItems.map((item) => new TableRow({ children: [item.name, item.description || '', price(item)].map((value) => new TableCell({ children: [new Paragraph(String(value))] })) })),
    ] }));
  });
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
}

async function pptxBuffer(items) {
  const presentation = new PptxGenJS();
  presentation.layout = 'LAYOUT_WIDE';
  presentation.author = 'Wrap & Roll';
  const groups = groupItems(items);
  const logoData = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`;
  const heroData = `data:image/jpeg;base64,${readFileSync(heroPath).toString('base64')}`;
  const addHeader = (slide, title, subtitle = '') => {
    slide.background = { color: brand.cream };
    slide.addImage({ data: logoData, x: 0.45, y: 0.28, w: 2.1, h: 0.58 });
    slide.addText(title, { x: 0.45, y: 1.12, w: 10, h: 0.42, fontFace: 'Arial', fontSize: 24, bold: true, color: brand.ink });
    if (subtitle) slide.addText(subtitle, { x: 0.48, y: 1.57, w: 10, h: 0.25, fontFace: 'Arial', fontSize: 9, color: brand.muted });
    slide.addShape(presentation.ShapeType.line, { x: 0.45, y: 1.95, w: 12.25, h: 0, line: { color: brand.red, pt: 1.5 } });
  };
  const cover = presentation.addSlide();
  cover.background = { color: brand.red };
  cover.addImage({ data: logoData, x: 0.8, y: 0.7, w: 3, h: 0.82 });
  cover.addImage({ data: heroData, x: 8.55, y: 0.65, w: 3.7, h: 5.4, transparency: 8 });
  cover.addShape(presentation.ShapeType.arc, { x: 8.2, y: 0.3, w: 4.4, h: 5.8, line: { color: brand.gold, pt: 2 }, adjustPoint: 0.2 });
  cover.addText('THE MENU BOOK', { x: 0.85, y: 2.25, w: 8, h: 0.65, fontFace: 'Arial', fontSize: 32, bold: true, color: 'FFFFFF' });
  cover.addText('Fresh food, made your way.', { x: 0.88, y: 3.02, w: 7, h: 0.35, fontFace: 'Arial', fontSize: 16, color: 'F7DCA0' });
  cover.addText('Wraps · Rolls · Pizzas · Burgers · Salads · Combos · Drinks', { x: 0.88, y: 6.3, w: 8, h: 0.3, fontFace: 'Arial', fontSize: 11, color: 'FFFFFF' });
  Object.entries(groups).forEach(([category, categoryItems]) => {
    const slide = presentation.addSlide();
    addHeader(slide, categoryLabel(category), `${categoryItems.length} menu items · Prices in TZS`);
    const rows = categoryItems.map((item) => [item.name, item.description || 'Freshly prepared', price(item)]);
    slide.addTable([['FOOD ITEM', 'DESCRIPTION', 'PRICE'], ...rows], { x: 0.45, y: 2.25, w: 12.1, h: 4.7, fontFace: 'Arial', fontSize: 10, color: brand.ink, border: { type: 'solid', color: 'EAD8C9', pt: 0.5 }, fill: 'FFFFFF', rowH: 0.42, colW: [3.5, 6.6, 2] });
  });
  return presentation.write({ outputType: 'nodebuffer' });
}

export async function createMenuBookExport(format, items, modifiers) {
  if (format === 'pdf') return { contentType: 'application/pdf', extension: 'pdf', buffer: await pdfBuffer(items) };
  if (format === 'xlsx') return { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx', buffer: await xlsxBuffer(items, modifiers) };
  if (format === 'docx') return { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx', buffer: await docxBuffer(items) };
  if (format === 'pptx') return { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: 'pptx', buffer: await pptxBuffer(items) };
  throw new Error('Supported menu book formats are PDF, Excel, Word, and PowerPoint');
}
