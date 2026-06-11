import { describe, expect, it } from 'vitest';
import { getPreset } from './config';

describe('built-in Word export presets', () => {
  it('keeps the report preset close to common GB/T 9704 public document layout', () => {
    const report = getPreset('report');

    expect(report.page).toMatchObject({
      width: 21,
      height: 29.7,
      margin_top: 3.7,
      margin_bottom: 3.5,
      margin_left: 2.8,
      margin_right: 2.6,
    });
    expect(report.fonts.default).toMatchObject({
      name: '仿宋_GB2312',
      ascii: 'Times New Roman',
      size: 16,
    });
    expect(report.paragraph).toMatchObject({
      line_spacing: 1.75,
      first_line_indent: 2,
      align: 'justify',
    });
    expect(report.titles.level1).toMatchObject({
      font: '方正小标宋简体',
      size: 22,
      bold: false,
      align: 'center',
    });
    expect(report.titles.level2).toMatchObject({
      font: '黑体',
      size: 16,
    });
    expect(report.page_number).toMatchObject({
      format: '1',
      font: '宋体',
      size: 14,
      align: 'center',
    });
  });

  it('keeps the academic preset close to common GB/T 7713.2 paper typography', () => {
    const academic = getPreset('academic');

    expect(academic.description).toContain('GB/T 7713.2');
    expect(academic.page.margin_top).toBe(2.54);
    expect(academic.fonts.default).toMatchObject({
      name: '宋体',
      ascii: 'Times New Roman',
      size: 10.5,
    });
    expect(academic.paragraph).toMatchObject({
      line_spacing: 1.5,
      first_line_indent: 2,
      align: 'justify',
    });
    expect(academic.titles.level1).toMatchObject({
      font: '黑体',
      size: 18,
      align: 'center',
    });
    expect(academic.titles.level2).toMatchObject({
      font: '黑体',
      size: 12,
      align: 'left',
    });
    expect(academic.titles.level3).toMatchObject({
      font: '黑体',
      size: 10.5,
    });
    expect(academic.table.header_font).toMatchObject({
      name: '黑体',
      ascii: 'Times New Roman',
      size: 9,
    });
    expect(academic.table.body_font).toMatchObject({
      name: '宋体',
      ascii: 'Times New Roman',
      size: 9,
    });
    expect(academic.image.show_caption).toBe(true);
  });
});
