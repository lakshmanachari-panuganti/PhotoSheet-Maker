import { z } from 'zod';

import { SUPPORTED_DPI } from '../constants/dpi.js';
import {
  ACCEPTED_MIME_TYPES,
  BOUNDS,
  HEX_COLOR_RE,
  OUTPUT_FORMATS,
} from '../constants/defaults.js';
import { PAPER_KEYS } from '../constants/paperSizes.js';
import { PHOTO_STANDARD_KEYS } from '../constants/photoStandards.js';
import { ORIENTATIONS, UNITS } from '../constants/units.js';

const dpiValues = SUPPORTED_DPI as readonly number[];

export const dpiSchema = z
  .number()
  .refine((v): v is 300 | 600 => dpiValues.includes(v), {
    message: `dpi must be one of ${SUPPORTED_DPI.join(', ')}`,
  });

export const unitSchema = z.enum(UNITS);

export const orientationSchema = z.enum(ORIENTATIONS);

export const outputFormatSchema = z.enum(OUTPUT_FORMATS);

export const photoStandardKeySchema = z.enum(PHOTO_STANDARD_KEYS);

export const paperKeySchema = z.enum(PAPER_KEYS);

export const acceptedMimeSchema = z.enum(ACCEPTED_MIME_TYPES);

export const customDimensionSchema = z.object({
  width: z.number().min(BOUNDS.customDimMm.min).max(BOUNDS.customDimMm.max),
  height: z.number().min(BOUNDS.customDimMm.min).max(BOUNDS.customDimMm.max),
  unit: unitSchema,
});

export const cropRectSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export const photoSpecSchema = z.object({
  fileIndex: z.number().int().nonnegative(),
  cropRect: cropRectSchema,
  rotationDeg: z
    .number()
    .finite()
    .min(BOUNDS.rotationDeg.min)
    .max(BOUNDS.rotationDeg.max),
  copies: z.number().int().min(BOUNDS.copies.min).max(BOUNDS.copies.max),
});

export const jobRequestSchema = z
  .object({
    photoStandard: photoStandardKeySchema,
    customPhotoDim: customDimensionSchema.optional(),
    paper: paperKeySchema,
    customPaperDim: customDimensionSchema.optional(),
    orientation: orientationSchema,
    dpi: dpiSchema,
    marginMm: z.number().min(BOUNDS.marginMm.min).max(BOUNDS.marginMm.max),
    gapMm: z.number().min(BOUNDS.gapMm.min).max(BOUNDS.gapMm.max),
    borderMm: z.number().min(BOUNDS.borderMm.min).max(BOUNDS.borderMm.max),
    backgroundHex: z.string().regex(HEX_COLOR_RE, 'backgroundHex must be a 6-digit hex color like #FFFFFF'),
    cutMarks: z.boolean(),
    cutMarkLengthMm: z
      .number()
      .min(BOUNDS.cutMarkLengthMm.min)
      .max(BOUNDS.cutMarkLengthMm.max),
    cutMarkWidthPx: z
      .number()
      .int()
      .min(BOUNDS.cutMarkWidthPx.min)
      .max(BOUNDS.cutMarkWidthPx.max),
    autoLayout: z.boolean(),
    fixedCols: z.number().int().positive().optional(),
    fixedRows: z.number().int().positive().optional(),
    outputFormat: outputFormatSchema,
    photos: z
      .array(photoSpecSchema)
      .min(BOUNDS.fileCount.min)
      .max(BOUNDS.fileCount.max),
  })
  .superRefine((data, ctx) => {
    if (data.photoStandard === 'CUSTOM' && data.customPhotoDim === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customPhotoDim'],
        message: 'customPhotoDim is required when photoStandard is CUSTOM',
      });
    }
    if (data.paper === 'CUSTOM' && data.customPaperDim === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customPaperDim'],
        message: 'customPaperDim is required when paper is CUSTOM',
      });
    }
    if (!data.autoLayout) {
      if (data.fixedCols === undefined || data.fixedRows === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fixedCols'],
          message: 'fixedCols and fixedRows are required when autoLayout is false',
        });
      }
    }
    const totalCopies = data.photos.reduce((sum, p) => sum + p.copies, 0);
    if (totalCopies < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['photos'],
        message: 'At least one copy is required across all photos',
      });
    }
  });

export type JobRequest = z.infer<typeof jobRequestSchema>;
export type PhotoSpec = z.infer<typeof photoSpecSchema>;
export type CropRect = z.infer<typeof cropRectSchema>;
export type CustomDimension = z.infer<typeof customDimensionSchema>;
