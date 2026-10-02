import type { RaccoonAppearance } from '../../src/scene/raccoonAppearance';

export function neutralRaccoonAppearance(): RaccoonAppearance {
  return {
    phenotype: {
      morphology: { bodyLength: 1, bodyHeight: 1, legLength: 1, headScale: 1, tailScale: 1 },
      behavior: { forageDrive: 1, migrationDrive: 1, riskTolerance: 1, recoveryDrive: 1 },
    },
    genome: {
      family: 'procyonid', material: { hueShift: 0, lightnessShift: 0, accentShift: 0 },
      niche: { grass: 1, shrub: 1, fruit: 1, crop: 1 }, locomotion: { stride: 1, endurance: 1 },
    },
  };
}
