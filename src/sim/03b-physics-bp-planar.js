// ============================================================================
// MOTOR FÍSICO ACOPLADO BAND-PASS (BP4, BP6 PARALELA & BP6 SÉRIE)
// Malha eletromecânico-acústica exata (impedância acústica / velocidade de volume)
// + Parâmetros clássicos de projeto e síntese: Q't (Qbp), S, DF, Pa
// ============================================================================
function buildBandPassAcousticModel(p) {
  const Fs = Math.max(1.0, p.Fs || 40.0);
  const Qms = Math.max(0.2, p.Qms || 7.0);
  const Qts_in = Math.max(0.05, Math.min(Qms * 0.95, p.Qts || 0.40));
  const Qes = Math.max(0.05, p.Qes || ((Qts_in * Qms) / Math.max(0.05, Qms - Qts_in)));
  const Qts = (Qms * Qes) / (Qms + Qes);
  const Re = Math.max(0.2, p.Re || 4.0);
  const Vas = Math.max(0.1, p.Vas || 50.0);
  const Sd_m2 = Math.max(1e-4, p.Sd_m2 || 0.05);
  const Pe = Math.max(1.0, p.Pe || 100.0);
  const Vr = Math.max(0.5, p.Vr || (p.Vb ? p.Vb * 0.75 : 30.0));
  const Vf = Math.max(0.5, p.Vb || 30.0);
  const Fb = Math.max(10.0, p.Fb || 60.0);
  const FbVr = Math.max(10.0, p.FbVr || 35.0);
  const QL = Math.max(1.0, p.QL || 15.0);
  const Qp = Math.max(10.0, p.Qp || 60.0);
  const rho = Math.max(0.5, p.rho || 1.205585);
  const c = Math.max(200.0, p.c || 343.37);
  const boxType = p.boxType || 'bp4';
  const bp6Mode = p.bp6Mode || 'parallel';

  const ws = 2.0 * Math.PI * Fs;
  const rhoC2 = rho * c * c;
  const Cas = (Vas / 1000.0) / rhoC2;
  const Mas = 1.0 / (ws * ws * Cas);
  const Ram = (ws * Mas) / Qms;
  const Rae = (ws * Mas) / Qes;
  const Rat = Ram + Rae;
  const bl2OverSd2 = Rae * Re; // (Bl / Sd)^2 = Rae * Re
  const Pg_pk = Math.sqrt(2.0 * Pe * Rae); // Pressão acústica de pico em Pe

  const Car = (Vr / 1000.0) / rhoC2;
  const Caf = (Vf / 1000.0) / rhoC2;

  const alphaR = Vas / Vr;
  const alphaF = Vas / Vf;
  const fcR = Fs * Math.sqrt(1.0 + alphaR);
  const qtcR = Qts * Math.sqrt(1.0 + alphaR);

  const wbf = 2.0 * Math.PI * Fb;
  const Mapf = 1.0 / (wbf * wbf * Caf);
  const Rapf = (wbf * Mapf) / Qp;
  const Gaf = (wbf * Caf) / QL;

  const wbr = 2.0 * Math.PI * FbVr;
  const Mapr = 1.0 / (wbr * wbr * Car);
  const Rapr = (wbr * Mapr) / Qp;
  const wRefR = (boxType === 'bp4') ? (2.0 * Math.PI * fcR) : wbr;
  const Gar = (wRefR * Car) / QL;

  return {
    boxType, bp6Mode, Fs, Qms, Qes, Qts, Re, Vas, Sd_m2, Pe,
    Vr, Vf, Fb, FbVr, QL, Qp, rho, c,
    Cas, Mas, Ram, Rae, Rat, bl2OverSd2, Pg_pk,
    Car, Caf, alphaR, alphaF, fcR, qtcR,
    Mapf, Rapf, Gaf, Mapr, Rapr, Gar,
    SpFront: Math.max(1e-5, p.SpFront || 0.01),
    SpRear: Math.max(1e-5, p.SpRear || 0.01)
  };
}

function evalBandPassFrequency(m, f) {
  const w = 2.0 * Math.PI * Math.max(1e-3, f);

  // Impedância acústica do transdutor (mecânica pura e total com amortecimento elétrico)
  const zAdmRe = m.Ram;
  const zAdmIm = (w * m.Mas) - (1.0 / (w * m.Cas));
  const zAdRe = m.Rat;
  const zAdIm = zAdmIm;

  // Duto frontal Zpf = Rapf + j*w*Mapf e sua admitância Ypf = 1/Zpf
  const zPfRe = m.Rapf;
  const zPfIm = w * m.Mapf;
  const zPfMag2 = Math.max(1e-30, zPfRe * zPfRe + zPfIm * zPfIm);
  const yPfRe = zPfRe / zPfMag2;
  const yPfIm = -zPfIm / zPfMag2;

  // Admitância capacitiva + perdas das câmaras
  const yCrRe = m.Gar;
  const yCrIm = w * m.Car;
  const yCfRe = m.Gaf;
  const yCfIm = w * m.Caf;

  let zLoadRe = 0, zLoadIm = 0;
  // Razões complexas U_pf / U_c, U_pr / U_c e U_out / U_c
  let rPfRe = 0, rPfIm = 0;
  let rPrRe = 0, rPrIm = 0;
  let rOutRe = 0, rOutIm = 0;

  if (m.boxType === 'bp4') {
    // Câmara traseira selada: Zr = 1 / Ycr
    const yCrMag2 = Math.max(1e-30, yCrRe * yCrRe + yCrIm * yCrIm);
    const zRRe = yCrRe / yCrMag2;
    const zRIm = -yCrIm / yCrMag2;

    // Câmara frontal dutada: Yf = Ycf + Ypf, Zf = 1 / Yf
    const yFRe = yCfRe + yPfRe;
    const yFIm = yCfIm + yPfIm;
    const yFMag2 = Math.max(1e-30, yFRe * yFRe + yFIm * yFIm);
    const zFRe = yFRe / yFMag2;
    const zFIm = -yFIm / yFMag2;

    zLoadRe = zRRe + zFRe;
    zLoadIm = zRIm + zFIm;

    // Upf / Uc = Zf * Ypf
    rPfRe = zFRe * yPfRe - zFIm * yPfIm;
    rPfIm = zFRe * yPfIm + zFIm * yPfRe;
    rOutRe = rPfRe;
    rOutIm = rPfIm;
  } else {
    // Duto traseiro/acoplador Zpr = Rapr + j*w*Mapr e sua admitância Ypr = 1/Zpr
    const zPrRe = m.Rapr;
    const zPrIm = w * m.Mapr;
    const zPrMag2 = Math.max(1e-30, zPrRe * zPrRe + zPrIm * zPrIm);
    const yPrRe = zPrRe / zPrMag2;
    const yPrIm = -zPrIm / zPrMag2;

    if (m.bp6Mode === 'series') {
      // BP6 Série: malha nodal 2x2 (VR acopla em VF via Ypr; VF radia ao exterior via Ypf)
      // A = Ycr + Ypr, B = Ycf + Ypr + Ypf, Delta = A*B - Ypr^2
      const aRe = yCrRe + yPrRe, aIm = yCrIm + yPrIm;
      const bRe = yCfRe + yPrRe + yPfRe, bIm = yCfIm + yPrIm + yPfIm;
      const abRe = aRe * bRe - aIm * bIm;
      const abIm = aRe * bIm + aIm * bRe;
      const c2Re = yPrRe * yPrRe - yPrIm * yPrIm;
      const c2Im = 2.0 * yPrRe * yPrIm;
      const detRe = abRe - c2Re;
      const detIm = abIm - c2Im;
      const detMag2 = Math.max(1e-30, detRe * detRe + detIm * detIm);

      // Soma Ysum = Ycr + Ycf + Ypf
      const sumRe = yCrRe + yCfRe + yPfRe;
      const sumIm = yCrIm + yCfIm + yPfIm;

      // Zload = Ysum / Delta
      zLoadRe = (sumRe * detRe + sumIm * detIm) / detMag2;
      zLoadIm = (sumIm * detRe - sumRe * detIm) / detMag2;

      // Upf / Uc = (Ycr * Ypf) / Delta
      const numFRe = yCrRe * yPfRe - yCrIm * yPfIm;
      const numFIm = yCrRe * yPfIm + yCrIm * yPfRe;
      rPfRe = (numFRe * detRe + numFIm * detIm) / detMag2;
      rPfIm = (numFIm * detRe - numFRe * detIm) / detMag2;

      // Upr / Uc = -(Ysum * Ypr) / Delta = -Zload * Ypr
      rPrRe = -(zLoadRe * yPrRe - zLoadIm * yPrIm);
      rPrIm = -(zLoadRe * yPrIm + zLoadIm * yPrRe);

      // Radiação externa sai apenas pelo duto frontal Upf
      rOutRe = rPfRe;
      rOutIm = rPfIm;
    } else {
      // BP6 Paralela: ambas câmaras dutadas ao exterior (radiação Uout = Upf + Upr)
      const yRRe = yCrRe + yPrRe;
      const yRIm = yCrIm + yPrIm;
      const yRMag2 = Math.max(1e-30, yRRe * yRRe + yRIm * yRIm);
      const zRRe = yRRe / yRMag2;
      const zRIm = -yRIm / yRMag2;

      const yFRe = yCfRe + yPfRe;
      const yFIm = yCfIm + yPfIm;
      const yFMag2 = Math.max(1e-30, yFRe * yFRe + yFIm * yFIm);
      const zFRe = yFRe / yFMag2;
      const zFIm = -yFIm / yFMag2;

      zLoadRe = zRRe + zFRe;
      zLoadIm = zRIm + zFIm;

      // Upf / Uc = +Zf * Ypf ; Upr / Uc = -Zr * Ypr (face traseira em oposição de fase)
      rPfRe = zFRe * yPfRe - zFIm * yPfIm;
      rPfIm = zFRe * yPfIm + zFIm * yPfRe;
      rPrRe = -(zRRe * yPrRe - zRIm * yPrIm);
      rPrIm = -(zRRe * yPrIm + zRIm * yPrRe);

      rOutRe = rPfRe + rPrRe;
      rOutIm = rPfIm + rPrIm;
    }
  }

  // Uc / Pg = 1 / (Zad + Zload)
  const zTotRe = zAdRe + zLoadRe;
  const zTotIm = zAdIm + zLoadIm;
  const zTotMag2 = Math.max(1e-30, zTotRe * zTotRe + zTotIm * zTotIm);
  const ucRe = zTotRe / zTotMag2;
  const ucIm = -zTotIm / zTotMag2;

  // Uout / Pg = (Uc / Pg) * (Uout / Uc)
  const uOutRe = ucRe * rOutRe - ucIm * rOutIm;
  const uOutIm = ucRe * rOutIm + ucIm * rOutRe;

  // Função de transferência acústica normalizada H(jw) = j*w*Mas * (Uout / Pg)
  const wMas = w * m.Mas;
  const H_re = -wMas * uOutIm;
  const H_im = wMas * uOutRe;

  // Magnitudes de velocidade de volume de pico em Pe (m³/s) e transferência individual de cada duto
  const ucNormMag = Math.hypot(ucRe, ucIm);
  const Uc_mag = m.Pg_pk * ucNormMag;
  const rPfMag = Math.hypot(rPfRe, rPfIm);
  const rPrMag = Math.hypot(rPrRe, rPrIm);
  const Upf_mag = Uc_mag * rPfMag;
  const Upr_mag = Uc_mag * rPrMag;
  const Hf_mag = wMas * ucNormMag * rPfMag;
  const Hr_mag = wMas * ucNormMag * rPrMag;

  // Impedância elétrica de entrada complexa real: Zin = Re + (Bl/Sd)^2 / (Zadm + Zload)
  const zMechRe = zAdmRe + zLoadRe;
  const zMechIm = zAdmIm + zLoadIm;
  const zMechMag2 = Math.max(1e-30, zMechRe * zMechRe + zMechIm * zMechIm);
  const Zin_re = m.Re + (m.bl2OverSd2 * zMechRe) / zMechMag2;
  const Zin_im = -(m.bl2OverSd2 * zMechIm) / zMechMag2;

  return { H_re, H_im, Hf_mag, Hr_mag, Uc_mag, Upf_mag, Upr_mag, Zin_re, Zin_im };
}

// =========================================================================
// MOTOR TMM / ABCD 1D ACOPLADO — PLANAR HORN / CAIXA EUCLIDES
// Combina circuito eletromecânico Thiele-Small, câmara traseira dutada (Vb, Fb, QL),
// guia de onda frontal 1D com atenuação visco-térmica e impedância de radiação
// de Beranek em semi-espaço 2pi, diferenciando Planar Quadrado vs Triângulo/Euclides.
// =========================================================================
function resolvePlanarTunnelGeometry({ A, B, t, nDrivers, planarStyle, recuoGInput }) {
  const A_mm = Math.max(150, parseFloat(A) || 550);
  const B_mm = Math.max(150, parseFloat(B) || 480);
  const t_mm = Math.max(6, parseFloat(t) || 18);
  const nDrv = Math.max(1, parseInt(nDrivers, 10) || 1);
  const style = (planarStyle === 'triangle') ? 'triangle' : 'square';
  const rawG = parseFloat(recuoGInput);
  const isAutoG = !Number.isFinite(rawG) || rawG <= 0;
  const recuoG = isAutoG
    ? Math.round(Math.max(120, Math.min(280, B_mm * 0.42)))
    : Math.round(Math.max(80, Math.min(600, rawG)));

  const nBays = (nDrv >= 2) ? 2 : 1;
  const bayA_mm = (nBays === 2) ? Math.max(120, (A_mm - t_mm) / 2.0) : A_mm;

  let C4 = null, Z_leg = null, S_side = null, Z_hyp = null;
  let St_bay_m2, Pt_bay_m;

  if (style === 'triangle') {
    Z_leg = Math.round(Math.min(A_mm, B_mm) * 0.22);
    S_side = Math.round(Math.max(40, B_mm - 2 * Z_leg));
    Z_hyp = Math.round(Z_leg * Math.SQRT2);
    // Seção octogonal do túnel por baia: A_bay*B - 4*(0.5*zl^2) = A_bay*B - 2*zl^2
    const zlBay = (nBays === 2) ? Math.min(Z_leg, bayA_mm * 0.28) : Z_leg;
    const a_m = bayA_mm / 1000.0;
    const b_m = B_mm / 1000.0;
    const z_m = zlBay / 1000.0;
    St_bay_m2 = Math.max(0.01, a_m * b_m - 2.0 * z_m * z_m);
    Pt_bay_m = Math.max(0.2, 2.0 * (a_m - 2.0 * z_m) + 2.0 * (b_m - 2.0 * z_m) + 4.0 * Math.SQRT2 * z_m);
  } else {
    C4 = Math.max(50.0, Math.round(B_mm - Math.min(110, B_mm * 0.18) - t_mm));
    // Seção retangular do túnel frontal acima da divisória: bayA x C4
    const a_m = bayA_mm / 1000.0;
    const c4_m = C4 / 1000.0;
    St_bay_m2 = Math.max(0.01, a_m * c4_m);
    Pt_bay_m = Math.max(0.2, 2.0 * (a_m + c4_m));
  }

  const St_total_m2 = St_bay_m2 * nBays;
  const rh_m = (2.0 * St_bay_m2) / Pt_bay_m;
  const aMouth_m = Math.sqrt(St_total_m2 / Math.PI);
  const Lt_m = recuoG / 1000.0;

  return {
    style, recuoG, isAutoG, C4, Z_leg, S_side, Z_hyp,
    nBays, St_m2: St_total_m2, Pt_m: Pt_bay_m * nBays, rh_m, aMouth_m, Lt_m
  };
}

function buildPlanarAcousticModel(p) {
  const Fs = Math.max(10.0, p.Fs || 40.0);
  const Qms = Math.max(0.2, p.Qms || 7.0);
  const Qts_in = Math.max(0.05, Math.min(Qms * 0.95, p.Qts || 0.40));
  const Qes = Math.max(0.05, p.Qes || ((Qts_in * Qms) / Math.max(0.05, Qms - Qts_in)));
  const Qts = (Qms * Qes) / (Qms + Qes);
  const Re = Math.max(0.2, p.Re || 4.0);
  const Vas = Math.max(0.1, p.Vas || 50.0);
  const Sd_m2 = Math.max(1e-4, p.Sd_m2 || 0.05);
  const Pe = Math.max(1.0, p.Pe || 100.0);
  const Vb = Math.max(0.5, p.Vb || 50.0);
  const Fb = Math.max(10.0, p.Fb || Fs);
  const QL = Math.max(1.0, p.QL || 7.0);
  const Qp = Math.max(10.0, p.Qp || 60.0);
  const rho = Math.max(0.5, p.rho || 1.205585);
  const c = Math.max(200.0, p.c || 343.37);
  const Sp = Math.max(1e-5, p.SpFront || p.Sp || 0.01);

  const ws = 2.0 * Math.PI * Fs;
  const rhoC2 = rho * c * c;
  const Cas = (Vas / 1000.0) / rhoC2;
  const Mas = 1.0 / (ws * ws * Cas);
  const Ram = (ws * Mas) / Qms;
  const Rae = (ws * Mas) / Qes;
  const Rat = Ram + Rae;
  const bl2OverSd2 = Rae * Re;
  const Pg_pk = Math.sqrt(2.0 * Pe * Rae);

  const Cab = (Vb / 1000.0) / rhoC2;
  const wb = 2.0 * Math.PI * Fb;
  const Map = 1.0 / (wb * wb * Cab);
  const Rap = (wb * Map) / Qp;
  const Gab = (wb * Cab) / QL;

  const planarStyle = (p.planarStyle === 'triangle') ? 'triangle' : 'square';
  const Lt_m = Math.max(0.05, (p.planarTunnelMm || 200) / 1000.0);
  const St_m2 = Math.max(0.01, p.planarSt_m2 || Math.max(Sd_m2 * 1.45, 0.16));
  const rh_m = Math.max(0.02, p.planarRh_m || Math.sqrt(St_m2 / Math.PI));
  const aMouth_m = Math.max(0.05, p.planarAMouth_m || Math.sqrt(St_m2 / Math.PI));
  const Z0 = (rho * c) / St_m2;

  // Correção de extremidade de Beranek em semi-espaço 2pi: dEnd = (8 / 3pi) * aMouth
  const dEnd_m = (8.0 / (3.0 * Math.PI)) * aMouth_m;
  const Leff_m = Lt_m + dEnd_m;
  const fQuarterWave = c / (4.0 * Leff_m);
  const fHalfWave = c / (2.0 * Leff_m);

  // Atenuação visco-térmica de Kirchhoff-Benade nas paredes do túnel (ar a 20°C)
  const nuAir = 1.516e-5;
  const thermoFactor = 1.4747; // 1 + (gamma - 1) / sqrt(Pr)
  const alphaWallCoef = (thermoFactor * Math.sqrt(nuAir / 2.0)) / (rh_m * c);
  const QtWaveguide = (planarStyle === 'triangle') ? 24.0 : 20.0;

  return {
    boxType: 'planar', planarStyle,
    Fs, Qms, Qes, Qts, Re, Vas, Sd_m2, Pe, Vb, Fb, QL, Qp, rho, c, Sp,
    Cas, Mas, Ram, Rae, Rat, bl2OverSd2, Pg_pk,
    Cab, Map, Rap, Gab,
    Lt_m, St_m2, rh_m, aMouth_m, Z0, dEnd_m, Leff_m,
    fQuarterWave, fHalfWave, alphaWallCoef, QtWaveguide
  };
}

function evalPlanarFrequency(m, f) {
  const w = 2.0 * Math.PI * Math.max(1e-3, f);
  const k = w / m.c;

  // 1. Impedância acústica do transdutor
  const zAdmRe = m.Ram;
  const zAdmIm = (w * m.Mas) - (1.0 / (w * m.Cas));
  const zAdRe = m.Rat;
  const zAdIm = zAdmIm;

  // 2. Câmara traseira dutada (Vb, QL, Fb)
  const yCbRe = m.Gab;
  const yCbIm = w * m.Cab;
  const zPRe = m.Rap;
  const zPIm = w * m.Map;
  const zPMag2 = Math.max(1e-30, zPRe * zPRe + zPIm * zPIm);
  const yPRe = zPRe / zPMag2;
  const yPIm = -zPIm / zPMag2;

  const yRRe = yCbRe + yPRe;
  const yRIm = yCbIm + yPIm;
  const yRMag2 = Math.max(1e-30, yRRe * yRRe + yRIm * yRIm);
  const zRRe = yRRe / yRMag2;
  const zRIm = -yRIm / yRMag2;

  // 3. Matriz de Transferência Acústica 1D (ABCD) do Túnel Frontal
  const alphaAtten = m.alphaWallCoef * Math.sqrt(w) + (k / (2.0 * m.QtWaveguide));
  const aL = Math.min(20.0, alphaAtten * m.Lt_m);
  const bL = k * m.Lt_m;
  const chA = Math.cosh(aL);
  const shA = Math.sinh(aL);
  const cosB = Math.cos(bL);
  const sinB = Math.sin(bL);

  const aRe = chA * cosB;
  const aIm = shA * sinB;
  const sRe = shA * cosB;
  const sIm = chA * sinB;
  const bRe = m.Z0 * sRe;
  const bIm = m.Z0 * sIm;
  const cRe = sRe / m.Z0;
  const cIm = sIm / m.Z0;

  // 4. Impedância de radiação de boca em semi-espaço 2pi (Beranek)
  const ka = k * m.aMouth_m;
  const ka2 = ka * ka;
  const rr = ka2 / (2.0 + ka2);
  const xr = ((8.0 / (3.0 * Math.PI)) * ka) / (1.0 + 0.48 * ka2);
  const zRadRe = m.Z0 * rr;
  const zRadIm = m.Z0 * xr;

  const numTRe = (aRe * zRadRe - aIm * zRadIm) + bRe;
  const numTIm = (aRe * zRadIm + aIm * zRadRe) + bIm;
  const denTRe = (cRe * zRadRe - cIm * zRadIm) + aRe;
  const denTIm = (cRe * zRadIm + cIm * zRadRe) + aIm;
  const denTMag2 = Math.max(1e-30, denTRe * denTRe + denTIm * denTIm);

  const zThRe = (numTRe * denTRe + numTIm * denTIm) / denTMag2;
  const zThIm = (numTIm * denTRe - numTRe * denTIm) / denTMag2;
  const tuRe = denTRe / denTMag2;
  const tuIm = -denTIm / denTMag2;

  // 5. Solução da rede acoplada (Planar Quadrado vs Triângulo / Euclides)
  let zLoadRe, zLoadIm;
  let rMouthConeRe, rMouthConeIm;
  let rMouthPortRe, rMouthPortIm;
  let rPortRawRe, rPortRawIm;

  const zrCbRe = zRRe * yCbRe - zRIm * yCbIm;
  const zrCbIm = zRRe * yCbIm + zRIm * yCbRe;

  if (m.planarStyle === 'triangle') {
    // Triângulo / Euclides: duto acoplado na garganta do túnel octogonal (z = 0)
    const yPZthRe = yPRe * zThRe - yPIm * zThIm;
    const yPZthIm = yPRe * zThIm + yPIm * zThRe;
    const dCoupRe = 1.0 + (zrCbRe * yPZthRe - zrCbIm * yPZthIm);
    const dCoupIm = (zrCbRe * yPZthIm + zrCbIm * yPZthRe);
    const dCoupMag2 = Math.max(1e-30, dCoupRe * dCoupRe + dCoupIm * dCoupIm);

    const rU1Re = (zrCbRe * dCoupRe + zrCbIm * dCoupIm) / dCoupMag2;
    const rU1Im = (zrCbIm * dCoupRe - zrCbRe * dCoupIm) / dCoupMag2;

    const z1Re = rU1Re * zThRe - rU1Im * zThIm;
    const z1Im = rU1Re * zThIm + rU1Im * zThRe;
    zLoadRe = zRRe + (zrCbRe * z1Re - zrCbIm * z1Im);
    zLoadIm = zRIm + (zrCbRe * z1Im + zrCbIm * z1Re);

    rPortRawRe = rU1Re - 1.0;
    rPortRawIm = rU1Im;

    rMouthConeRe = tuRe;
    rMouthConeIm = tuIm;
    rMouthPortRe = tuRe * rPortRawRe - tuIm * rPortRawIm;
    rMouthPortIm = tuRe * rPortRawIm + tuIm * rPortRawRe;
  } else {
    // Quadrado: cone alimenta o túnel frontal (A×C4); duto sai paralelo no plano da boca
    zLoadRe = zRRe + zThRe;
    zLoadIm = zRIm + zThIm;

    rPortRawRe = zrCbRe - 1.0;
    rPortRawIm = zrCbIm;

    rMouthConeRe = tuRe;
    rMouthConeIm = tuIm;
    rMouthPortRe = rPortRawRe;
    rMouthPortIm = rPortRawIm;
  }

  // Soma vetorial complexa das velocidades de volume na boca (túnel + duto)
  const rOutRe = rMouthConeRe + rMouthPortRe;
  const rOutIm = rMouthConeIm + rMouthPortIm;

  // 6. Velocidade de volume do cone Uc / Pg = 1 / (Zad + Zload)
  const zTotRe = zAdRe + zLoadRe;
  const zTotIm = zAdIm + zLoadIm;
  const zTotMag2 = Math.max(1e-30, zTotRe * zTotRe + zTotIm * zTotIm);
  const ucRe = zTotRe / zTotMag2;
  const ucIm = -zTotIm / zTotMag2;

  const uOutRe = ucRe * rOutRe - ucIm * rOutIm;
  const uOutIm = ucRe * rOutIm + ucIm * rOutRe;

  // Transferência normalizada em semi-espaço 2pi: H(jw) = j*w*Mas * (Uout / Pg)
  const wMas = w * m.Mas;
  const H_re = -wMas * uOutIm;
  const H_im = wMas * uOutRe;

  const ucNormMag = Math.hypot(ucRe, ucIm);
  const Uc_mag = m.Pg_pk * ucNormMag;
  const Up_mag = Uc_mag * Math.hypot(rPortRawRe, rPortRawIm);
  const Hcone_mag = wMas * ucNormMag * Math.hypot(rMouthConeRe, rMouthConeIm);
  const Hvent_mag = wMas * ucNormMag * Math.hypot(rMouthPortRe, rMouthPortIm);

  // Impedância elétrica real acoplada: Zin = Re + (Bl/Sd)^2 / (Zadm + Zload)
  const zMechRe = zAdmRe + zLoadRe;
  const zMechIm = zAdmIm + zLoadIm;
  const zMechMag2 = Math.max(1e-30, zMechRe * zMechRe + zMechIm * zMechIm);
  const Zin_re = m.Re + (m.bl2OverSd2 * zMechRe) / zMechMag2;
  const Zin_im = -(m.bl2OverSd2 * zMechIm) / zMechMag2;

  return { H_re, H_im, Hcone_mag, Hvent_mag, Uc_mag, Up_mag, Zin_re, Zin_im };
}

function onPlanarGeomChange() {
  if (document.getElementById('boxType')?.value === 'planar') recalculate();
  else updateWoodlock();
}

let bpSynthClampNote = '';

function onBpAlignPresetChange() {
  bpSynthClampNote = '';
  const sel = document.getElementById('bpAlignPreset');
  if (!sel) return;
  const key = sel.value;
  const bp4Presets = {
    butterworth:    { S: 0.707, Pa: 0.0 },
    bessel:         { S: 0.866, Pa: -1.5 },
    extended:       { S: 0.707, Pa: -2.0 },
    chebyshev_mild: { S: 0.600, Pa: 1.5 },
    chebyshev_spl:  { S: 0.500, Pa: 3.0 }
  };
  if (bp4Presets[key]) {
    const sEl = document.getElementById('bpTargetS');
    const paEl = document.getElementById('bpTargetPa');
    if (sEl) sEl.value = bp4Presets[key].S.toFixed(3);
    if (paEl) paEl.value = bp4Presets[key].Pa.toFixed(1);
  }
}

function applyBandPassSynthesis() {
  const boxType = document.getElementById('boxType')?.value || 'bp4';
  if (boxType !== 'bp4' && boxType !== 'bp6') return;

  const nDrivers = Math.max(1, parseInt(document.getElementById('simNumDrivers')?.value) || 1);
  const Fs = Math.max(10, parseFloat(document.getElementById('tsFs')?.value) || 40);
  const Qes_nom = Math.max(0.05, parseFloat(document.getElementById('tsQes')?.value) || 0.44);
  const Qms = Math.max(0.5, parseFloat(document.getElementById('tsQms')?.value) || 9.0);
  const deltaT = Math.max(0, parseFloat(document.getElementById('thermalDeltaT')?.value) || 0);
  const Qes = Qes_nom * (1.0 + 0.00393 * deltaT);
  const Qts = (Qms * Qes) / (Qms + Qes);
  const Vas = Math.max(1.0, (parseFloat(document.getElementById('tsVas')?.value) || 100) * nDrivers);

  bpSynthClampNote = '';
  let Vr, Vf, Fb, FbVr = null;
  if (boxType === 'bp4') {
    const S = Math.max(0.35, Math.min(1.20, parseFloat(document.getElementById('bpTargetS')?.value) || 0.707));
    const Pa = Math.max(-6.0, Math.min(6.0, parseFloat(document.getElementById('bpTargetPa')?.value) || 0.0));
    // Síntese canônica BP4 (Geddes 1989 / Dickason):
    // Vf = (2 * S * Qts)^2 * Vas ; B = 10^(-Pa/40) ; Qtc = 1 / (2 * S * B) ; Vr = Vas / ((Qtc/Qts)^2 - 1) ; Fb = Fc = Fs * (Qtc/Qts)
    const vfRaw = Math.pow(2.0 * S * Qts, 2) * Vas;
    Vf = Math.max(2.0, vfRaw);
    const B = Math.pow(10.0, -Pa / 40.0);
    const qtcRaw = 1.0 / (2.0 * S * B);
    const qtcMin = Qts * 1.12;
    const qtcTarget = Math.max(qtcMin, qtcRaw);
    const ratio2 = Math.pow(qtcTarget / Qts, 2);
    const vrRaw = Vas / Math.max(0.15, ratio2 - 1.0);
    Vr = Math.max(2.0, vrRaw);
    Fb = Fs * Math.sqrt(1.0 + Vas / Vr);
    if (qtcRaw < qtcMin - 1e-3) {
      bpSynthClampNote = `⚠️ Limitado por Qts=${Qts.toFixed(2)} (Qtc mín ${qtcMin.toFixed(2)} vs alvo ${qtcRaw.toFixed(2)})`;
    } else if (vfRaw < 2.0 || vrRaw < 2.0) {
      bpSynthClampNote = `⚠️ Volume mínimo de 2.0 L atingido (S/Pa ajustados)`;
    }
  } else {
    const preset = document.getElementById('bpAlignPreset')?.value || 'bp6_flat';
    // BP6 Paralela (ambas câmaras dutadas ao exterior: VR maior/grave, VF menor/médio-grave)
    if (preset === 'bp6_ext') {
      Vr = Math.max(5.0, Vas * 1.15);
      Vf = Math.max(3.0, Vas * 0.52);
      FbVr = Math.max(18.0, Fs * 0.76);
      Fb = FbVr * 1.95;
    } else if (preset === 'bp6_spl') {
      Vr = Math.max(5.0, Vas * 0.65);
      Vf = Math.max(3.0, Vas * 0.34);
      FbVr = Math.max(20.0, Fs * 1.02);
      Fb = FbVr * 1.75;
    } else {
      // bp6_flat (Quasi-Plana Paralela)
      Vr = Math.max(5.0, Vas * 0.88);
      Vf = Math.max(3.0, Vas * 0.44);
      FbVr = Math.max(18.0, Fs * 0.86);
      Fb = FbVr * 1.85;
    }
  }

  const vrEl = document.getElementById('vrInput');
  const vbEl = document.getElementById('vbInput');
  const fbEl = document.getElementById('fbInput');
  const fbVrEl = document.getElementById('fbVrInput');
  if (vrEl) vrEl.value = (Math.round(Vr * 10) / 10).toFixed(1);
  if (vbEl) vbEl.value = (Math.round(Vf * 10) / 10).toFixed(1);
  if (fbEl) fbEl.value = (Math.round(Fb * 100) / 100).toFixed(2);
  syncSliderRange('vrRange', Vr, 5);
  syncSliderRange('vbRange', Vf, 5);
  syncSliderRange('fbRange', Fb, 15);
  if (FbVr !== null && fbVrEl) {
    fbVrEl.value = (Math.round(FbVr * 10) / 10).toFixed(1);
    syncSliderRange('fbVrRange', FbVr, 15);
  }
  isAutoTune = (boxType === 'bp4');
  recalculate();
  autoSizeBandPassPorts(boxType, true);
  autofixWoodlockGeometry('síntese Band-Pass', { resetToMin: true });
}
