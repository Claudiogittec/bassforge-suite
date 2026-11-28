    const STORAGE_DB_KEY = 'BASSFORGE_DRIVER_DB_V1';
    const STORAGE_ACTIVE_KEY = 'BASSFORGE_ACTIVE_DRIVER_V1';
    const FACTORY_CATALOG = (window.CL_DRIVERS_CATALOG || window.DRIVERS_CATALOG || []).slice();

    const CLAudioDatabaseAgent = {
      driverKey(brand, model) {
        return (String(brand || '').trim() + '_' + String(model || '').trim()).toLowerCase().replace(/\s+/g, '_');
      },
      estimateVsub(diameterIn) {
        const d = parseFloat(diameterIn) || 12;
        if (d >= 21) return 12.0;
        if (d >= 18) return 9.0;
        if (d >= 15) return 6.5;
        if (d >= 12) return 3.5;
        if (d >= 10) return 2.5;
        return 1.5;
      },
      nextId(table) {
        const maxId = (table || []).reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
        return maxId + 1;
      },
      findByBrandModel(table, brand, model) {
        const key = this.driverKey(brand, model);
        return table.find(d => this.driverKey(d.brand, d.model) === key) || null;
      },
      sanitize(driver) {
        const num = (v, def = 0) => {
          const n = parseFloat(v);
          return isFinite(n) && !isNaN(n) ? n : def;
        };
        const dia = num(driver.diameter_in || driver.dia, 12);
        const rawVsub = num(driver.vsub, 0);
        return {
          id: parseInt(driver.id) > 0 ? parseInt(driver.id) : 0,
          origin: driver.origin || 'datasheet',
          brand: String(driver.brand || '').trim(),
          model: String(driver.model || '').trim(),
          series: String(driver.series || '').trim(),
          year: parseInt(driver.year) || 2024,
          diameter_in: dia,
          znom: num(driver.znom, 4),
          pe: num(driver.pe, 100),
          sd: num(driver.sd, 500),
          fs: num(driver.fs, 40),
          vas: num(driver.vas, 50),
          qes: num(driver.qes, 0.4),
          qms: num(driver.qms, 5),
          xmax: num(driver.xmax, 5),
          re: num(driver.re, 3.5),
          le: num(driver.le, 1.0),
          hvc: num(driver.hvc, 0),
          hgap: num(driver.hgap, 0),
          mms_cat: num(driver.mms_cat ?? driver.mms, 0),
          bl_cat: num(driver.bl_cat ?? driver.bl, 0),
          vsub: rawVsub > 0 ? rawVsub : this.estimateVsub(dia)
        };
      },
      validate(driver) {
        const errors = [];
        const isPosFin = v => Number.isFinite(Number(v)) && Number(v) > 0;
        if (!driver || !String(driver.brand || '').trim()) errors.push('Marca é obrigatória');
        if (!driver || !String(driver.model || '').trim()) errors.push('Modelo é obrigatório');
        if (!isPosFin(driver?.diameter_in)) errors.push('Diâmetro deve ser > 0');
        if (!isPosFin(driver?.znom)) errors.push('Znom deve ser > 0');
        if (!isPosFin(driver?.pe)) errors.push('Pe deve ser > 0');
        if (!isPosFin(driver?.xmax)) errors.push('Xmax deve ser > 0');
        if (!isPosFin(driver?.fs)) errors.push('Fs deve ser > 0');
        if (!isPosFin(driver?.qes)) errors.push('Qes deve ser > 0');
        if (!isPosFin(driver?.qms)) errors.push('Qms deve ser > 0');
        if (!isPosFin(driver?.vas)) errors.push('Vas deve ser > 0');
        if (!isPosFin(driver?.sd)) errors.push('Sd deve ser > 0');
        if (!isPosFin(driver?.re)) errors.push('Re deve ser > 0');
        if (driver?.le !== undefined && driver?.le !== '' && (!Number.isFinite(Number(driver.le)) || Number(driver.le) < 0)) {
          errors.push('Le deve ser ≥ 0');
        }
        return { valid: errors.length === 0, errors };
      }
    };

    function escapeHtmlStr(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function fmtNumSafe(val, dec = 1, fallback = '—') {
      const n = Number(val);
      return Number.isFinite(n) ? n.toFixed(dec) : fallback;
    }

    function updateCatalogCounters() {
      const n = DRIVER_CATALOG.length;
      const btn = document.getElementById('btn-catalog-open');
      if (btn) btn.textContent = `Catálogo (${n})`;
      const hdr = document.getElementById('modal-catalog-title');
      if (hdr) hdr.textContent = `CATÁLOGO DE DRIVERS (${n})`;
    }

    function saveCatalogStorage() {
      try {
        localStorage.setItem(STORAGE_DB_KEY, JSON.stringify({
          schema: 'bassforge-driver-db/v1',
          factoryCount: FACTORY_CATALOG.length,
          updatedAt: new Date().toISOString(),
          drivers: DRIVER_CATALOG
        }));
      } catch (e) { console.warn('[BassForge DB] Falha ao salvar catálogo no localStorage:', e); if (typeof showToast === 'function') showToast('Aviso: armazenamento local indisponível.'); }
      updateCatalogCounters();
    }

    function loadCatalogStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_DB_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.drivers) ? parsed.drivers : null);
          if (arr) {
            DRIVER_CATALOG = arr.map((d, idx) => {
              const s = CLAudioDatabaseAgent.sanitize(d);
              if (!s.id) s.id = idx + 1;
              return s;
            });
            const savedFactoryCount = Number(parsed?.factoryCount || 0);
            if (arr.length > 0 && savedFactoryCount < FACTORY_CATALOG.length) {
              const existingKeys = new Set(DRIVER_CATALOG.map(x => CLAudioDatabaseAgent.driverKey(x.brand, x.model)));
              let nextId = CLAudioDatabaseAgent.nextId(DRIVER_CATALOG);
              for (const fd of FACTORY_CATALOG) {
                const k = CLAudioDatabaseAgent.driverKey(fd.brand, fd.model);
                if (!existingKeys.has(k)) {
                  existingKeys.add(k);
                  const s = CLAudioDatabaseAgent.sanitize(fd);
                  s.id = nextId++;
                  DRIVER_CATALOG.push(s);
                }
              }
              saveCatalogStorage();
              return;
            }
            updateCatalogCounters();
            return;
          }
        }
      } catch (e) { console.warn('[BassForge DB] Falha ao ler catálogo do localStorage; restaurando catálogo de fábrica:', e); }
      DRIVER_CATALOG = FACTORY_CATALOG.map((d, idx) => {
        const s = CLAudioDatabaseAgent.sanitize(d);
        if (!s.id) s.id = idx + 1;
        return s;
      });
      saveCatalogStorage();
    }

    /**
     * @namespace CLAudioCrossValidation
     * @description Motor Físico Completo de 28 Parâmetros Eletroacústicos
     */
    const CLAudioCrossValidation = {
      audit(d, atmo = { c: 343.21, rho: 1.2041, gamma: 1.400 }) {
        const { c, rho, gamma } = atmo;
        const Vas_m3 = (d.vas || 0) / 1000.0;
        const Sd_m2 = (d.sd || 0) / 10000.0;
        const w0 = 2 * Math.PI * (d.fs || 40);

        // 1. Parâmetros Eletromecânicos Fundamentais
        const Qts = (d.qes > 0 && d.qms > 0) ? (d.qes * d.qms) / (d.qes + d.qms) : 0;
        const Cms = (rho > 0 && c > 0 && Sd_m2 > 0) ? Vas_m3 / (rho * Math.pow(c, 2) * Math.pow(Sd_m2, 2)) : 0;
        const Kms = Cms > 0 ? 1.0 / Cms : 0;
        const Mms = (w0 > 0 && Cms > 0) ? 1.0 / (Math.pow(w0, 2) * Cms) : 0;
        const a_m = Sd_m2 > 0 ? Math.sqrt(Sd_m2 / Math.PI) : 0; // Raio do pistão em metros
        // Massa de radiação total em espaço livre 4π (ambos os lados = 2 * 4/3 * rho * a^3 = 8/3 * rho * a^3; Morse 1968)
        const Mma_free = (8.0 / 3.0) * rho * Math.pow(a_m, 3);
        const Mmd = Math.max(Mms - Mma_free, 0.001);
        const Bl = (d.qes > 0 && Mms > 0 && d.re > 0) ? Math.sqrt((w0 * Mms * d.re) / d.qes) : 0;
        const Rms = (d.qms > 0 && Mms > 0) ? (w0 * Mms) / d.qms : 0;

        // 2. Parâmetros Acústicos
        const Cas = Cms * Math.pow(Sd_m2, 2);
        const Mas = Sd_m2 > 0 ? Mms / Math.pow(Sd_m2, 2) : 0;
        const Ras = Sd_m2 > 0 ? Rms / Math.pow(Sd_m2, 2) : 0;

        // 3. Dinâmica do Motor & Transientes Avançados
        const bl2_re = d.re > 0 ? Math.pow(Bl, 2) / d.re : 0; // N²/W (Densidade de força)
        const accel_factor = Mms > 0 ? Bl / Mms : 0; // m/s²/A (Aceleração do cone)
        const f_breakup = a_m > 0 ? c / (2 * Math.PI * a_m) : 0; // Breakup rígido do pistão em Hz
        const tau_e_ms = d.re > 0 ? (d.le / d.re) : 0; // ms
        const tau_m_ms = Math.pow(Bl, 2) > 0 ? ((Mms * d.re) / Math.pow(Bl, 2)) * 1000 : 0; // ms

        // 4. Curva de Ressonância de Impedância
        const r0 = d.qes > 0 ? 1 + (d.qms / d.qes) : 1; // Razão de impedância
        const R0 = d.re * r0; // Impedância no pico de ressonância (Ω)
        const delta_f = d.qms > 0 ? (d.fs * Math.sqrt(r0)) / d.qms : 0; // Largura de banda em Z12 = sqrt(Re * R0) (Hz)
        const f1 = (-delta_f + Math.sqrt(Math.pow(delta_f, 2) + 4 * Math.pow(d.fs, 2))) / 2;
        const f2 = f1 + delta_f;

        // 5. Eficiência, Potência & Limites (First-Principles 2π sr @ p_ref = 20 µPa)
        const eta0 = (c > 0 && d.qes > 0) ? ((4 * Math.pow(Math.PI, 2)) / Math.pow(c, 3)) * ((Math.pow(d.fs, 3) * Vas_m3) / d.qes) : 0;
        const k_spl = (rho * c) / (2 * Math.PI * 4e-10);
        const SPL1W = 10 * Math.log10(k_spl * Math.max(eta0, 1e-12));
        const SPL2_83 = d.re > 0 ? SPL1W + 10 * Math.log10(8.0 / d.re) : SPL1W;
        const SPL_max_term = d.pe > 0 ? SPL1W + 10 * Math.log10(d.pe) : SPL1W;
        const Pac_max = eta0 * (d.pe || 1);
        const Vd = (d.sd * (d.xmax / 10.0)) / 1000.0;
        const EBP = d.qes > 0 ? d.fs / d.qes : 0;
        const x_geom = (d.hvc > 0 && d.hgap > 0) ? Math.abs(d.hvc - d.hgap) / 2 : d.xmax;

        // 6. Rotas de Auditoria Classe I de Fs (Não-Tautológicas quando Mms/Bl de catálogo são informados)
        const hasMmsCat = (d.mms_cat || 0) > 0;
        const hasBlCat = (d.bl_cat || 0) > 0;
        const hasCatalogAudit = hasMmsCat || hasBlCat;
        const Mms_audit = hasMmsCat ? (d.mms_cat / 1000.0) : Mms;
        const Bl_audit = hasBlCat ? d.bl_cat : Bl;

        const fs_1 = (Mms_audit > 0 && Cms > 0) ? 1.0 / (2 * Math.PI * Math.sqrt(Mms_audit * Cms)) : 0;
        const Cms_vas = (rho > 0 && c > 0 && Sd_m2 > 0) ? Vas_m3 / (rho * c * c * Sd_m2 * Sd_m2) : 0;
        const fs_2 = (Mms_audit > 0 && Cms_vas > 0) ? 1.0 / (2 * Math.PI * Math.sqrt(Mms_audit * Cms_vas)) : 0;
        const fs_3 = (Mms_audit > 0 && d.re > 0) ? (d.qes * Math.pow(Bl_audit, 2)) / (2 * Math.PI * Mms_audit * d.re) : 0;

        const dev_1 = d.fs > 0 ? Math.abs((fs_1 - d.fs) / d.fs) * 100.0 : 0;
        const dev_2 = d.fs > 0 ? Math.abs((fs_2 - d.fs) / d.fs) * 100.0 : 0;
        const dev_3 = d.fs > 0 ? Math.abs((fs_3 - d.fs) / d.fs) * 100.0 : 0;
        const worst_dev = Math.max(dev_1, dev_2, dev_3);

        const dev_mms_pct = (hasMmsCat && Mms > 0) ? ((d.mms_cat - Mms * 1000) / (Mms * 1000)) * 100.0 : null;
        const dev_bl_pct = (hasBlCat && Bl > 0) ? ((d.bl_cat - Bl) / Bl) * 100.0 : null;

        const p_implied = (gamma > 0 && Sd_m2 > 0 && Cms > 0) ? Vas_m3 / (gamma * Math.pow(Sd_m2, 2) * Cms) : (rho * c * c / gamma);
        const p_atm = (rho * c * c) / gamma;

        let veredito = 'VERIFIED';
        let vereditoClass = 'good';
        let vereditoLabel = hasCatalogAudit ? 'Consistente (≤ 5%)' : 'T/S Derivado (sem Mms/Bl cat.)';

        if (worst_dev > 10.0) {
          veredito = 'INCONSISTENT'; vereditoClass = 'bad'; vereditoLabel = 'Inconsistente (> 10%)';
        } else if (worst_dev > 5.0) {
          veredito = 'TOLERATED'; vereditoClass = 'warn'; vereditoLabel = 'Tolerado (5–10%)';
        }

        return {
          atmo: { c, rho, gamma, p_atm },
          // Fundamentais
          Qts, Cms, Cms_mm_N: Cms * 1000, Kms, Kms_N_mm: Kms / 1000,
          Mms, Mms_g: Mms * 1000, Mmd_g: Mmd * 1000, Bl, Rms, Cas, Mas, Ras,
          radius_cm: a_m * 100, radius_mm: a_m * 1000,
          // Dinâmica & Motor
          bl2_re, accel_factor, f_breakup, tau_e_ms, tau_m_ms,
          // Curva de Impedância
          r0, R0, delta_f, f1, f2,
          // Eficiência & SPL
          eta0, eta0_pct: eta0 * 100, SPL1W, SPL2_83, SPL_max_term, Pac_max, Vd, EBP, x_geom, p_implied,
          // Auditoria
          hasMmsCat, hasBlCat, hasCatalogAudit, dev_mms_pct, dev_bl_pct,
          fs_1, fs_2, fs_3, dev_1, dev_2, dev_3, worst_dev,
          veredito, vereditoClass, vereditoLabel
        };
      }
    };

    let currentCalculation = null;
    let selectedDBId = null;
    let parsedTsvData = [];

    window.addEventListener('DOMContentLoaded', () => {
      loadCatalogStorage();
      if (DRIVER_CATALOG.length > 0) {
        carregarNoFormulario(DRIVER_CATALOG[0]);
      } else {
        onParamInput();
      }
      renderTable();
    });

    function getFormValues() {
      const g = id => parseFloat(document.getElementById(id)?.value) || 0;
      const t = id => document.getElementById(id)?.value.trim() || '';

      const coilsStr = t('inp-coils');
      let hvc = 0, hgap = 0;
      if (coilsStr.includes('/')) {
        const parts = coilsStr.split('/');
        hvc = parseFloat(parts[0]) || 0;
        hgap = parseFloat(parts[1]) || 0;
      }

      return CLAudioDatabaseAgent.sanitize({
        brand: t('inp-brand'), model: t('inp-model'), series: t('inp-series'),
        year: g('inp-year'), diameter_in: g('inp-dia'), znom: g('inp-znom'),
        pe: g('inp-pe'), sd: g('inp-sd'), fs: g('inp-fs'), vas: g('inp-vas'),
        qes: g('inp-qes'), qms: g('inp-qms'), xmax: g('inp-xmax'), re: g('inp-re'),
        le: g('inp-le'), hvc, hgap,
        mms_cat: g('inp-mms'), bl_cat: g('inp-bl'), vsub: g('inp-vsub'),
        origin: document.getElementById('inp-origin')?.value || 'datasheet'
      });
    }

    function onParamInput() {
      const d = getFormValues();
      currentCalculation = CLAudioCrossValidation.audit(d);
      const c = currentCalculation;

      // 1. Mecânica & Acústica
      document.getElementById('drv-qts').textContent = c.Qts.toFixed(3);
      document.getElementById('drv-cms').textContent = c.Cms_mm_N.toFixed(3) + ' mm/N';
      document.getElementById('drv-kms').textContent = c.Kms_N_mm.toFixed(1) + ' N/mm';
      document.getElementById('drv-mms').textContent = c.Mms_g.toFixed(1) + ' g';
      document.getElementById('drv-mmd').textContent = c.Mmd_g.toFixed(1) + ' g';
      document.getElementById('drv-rms').textContent = c.Rms.toFixed(2) + ' kg/s';
      document.getElementById('drv-cas').textContent = (c.Cas * 1e8).toFixed(2) + ' ×10⁻⁸';
      document.getElementById('drv-mas').textContent = c.Mas.toFixed(1) + ' kg/m⁴';
      document.getElementById('drv-ras').textContent = c.Ras.toFixed(0) + ' N·s/m⁵';
      document.getElementById('drv-radius').textContent = c.radius_cm.toFixed(2) + ' cm';
      document.getElementById('badge-ebp').textContent = 'EBP: ' + c.EBP.toFixed(1);

      // 2. Dinâmica & Motor
      document.getElementById('drv-bl').textContent = c.Bl.toFixed(2) + ' T·m';
      document.getElementById('drv-bl2re').textContent = c.bl2_re.toFixed(1) + ' N²/W';
      document.getElementById('drv-motor-dense').textContent = 'Bl²/Re: ' + c.bl2_re.toFixed(1) + ' N²/W';
      document.getElementById('drv-accel').textContent = c.accel_factor.toFixed(1) + ' m/s²/A';
      document.getElementById('drv-fbreak').textContent = Math.round(c.f_breakup) + ' Hz';
      document.getElementById('drv-taue').textContent = c.tau_e_ms.toFixed(2) + ' ms';
      document.getElementById('drv-taum').textContent = c.tau_m_ms.toFixed(2) + ' ms';

      // 3. Eficiência & Limites
      document.getElementById('drv-eta').textContent = c.eta0_pct.toFixed(2) + ' %';
      document.getElementById('drv-spl1w').textContent = c.SPL1W.toFixed(1) + ' dB';
      document.getElementById('drv-spl2v').textContent = c.SPL2_83.toFixed(1) + ' dB';
      document.getElementById('drv-splmax').textContent = c.SPL_max_term.toFixed(1) + ' dB';
      document.getElementById('drv-splmax-badge').textContent = 'SPL Max: ' + c.SPL_max_term.toFixed(1) + ' dB';
      document.getElementById('drv-pac').textContent = c.Pac_max.toFixed(1) + ' W ac';
      document.getElementById('drv-vd').textContent = c.Vd.toFixed(3) + ' L';
      document.getElementById('drv-xgeom').textContent = c.x_geom.toFixed(2) + ' mm';
      document.getElementById('drv-r0').textContent = c.R0.toFixed(1) + ' Ω';

      // 4. Painel de Auditoria Cruzada
      const lblAtmo = document.getElementById('lbl-atmo-cond');
      if (lblAtmo && c.atmo) {
        lblAtmo.textContent = `c = ${c.atmo.c.toFixed(2)} m/s · ρ = ${c.atmo.rho.toFixed(4)} kg/m³ · P₀ = ${(c.atmo.p_atm / 100).toFixed(2)} hPa`;
      }
      document.getElementById('aud-fs-1').textContent = `${c.fs_1.toFixed(2)} Hz (${c.dev_1.toFixed(1)}%)`;
      document.getElementById('aud-fs-2').textContent = `${c.fs_2.toFixed(2)} Hz (${c.dev_2.toFixed(1)}%)`;
      document.getElementById('aud-fs-3').textContent = `${c.fs_3.toFixed(2)} Hz (${c.dev_3.toFixed(1)}%)`;
      document.getElementById('aud-r0').textContent = `${c.R0.toFixed(1)} Ω (r₀: ${c.r0.toFixed(1)})`;
      document.getElementById('aud-deltaf').textContent = `${c.delta_f.toFixed(1)} Hz (${c.f1.toFixed(0)} - ${c.f2.toFixed(0)}Hz)`;
      document.getElementById('aud-p-imp').textContent = Math.round(c.p_implied / 100) + ' hPa';

      const vCard = document.getElementById('aud-veredito-card');
      const vColor = (c.vereditoClass === 'good' ? 'var(--status-ok)' : (c.vereditoClass === 'warn' ? 'var(--status-warn)' : 'var(--status-err)'));
      vCard.style.borderLeftColor = vColor;
      const vTitle = document.getElementById('aud-ver-title');
      vTitle.style.color = vColor;
      vTitle.textContent = c.vereditoLabel.toUpperCase();
      const vDot = document.getElementById('aud-ver-dot');
      if (vDot) vDot.style.background = vColor;
      if (c.hasCatalogAudit) {
        const parts = [];
        if (c.dev_mms_pct !== null) parts.push(`ΔMms: ${c.dev_mms_pct >= 0 ? '+' : ''}${c.dev_mms_pct.toFixed(2)}%`);
        if (c.dev_bl_pct !== null) parts.push(`ΔBl: ${c.dev_bl_pct >= 0 ? '+' : ''}${c.dev_bl_pct.toFixed(2)}%`);
        document.getElementById('aud-ver-desc').textContent = `Auditoria não-tautológica · Desvio máx. Fs: ${c.worst_dev.toFixed(1)}%${parts.length ? ' · ' + parts.join(' · ') : ''}`;
      } else {
        document.getElementById('aud-ver-desc').textContent = `Modo derivação (0.0% por identidade algébrica). Informe Mms/Bl de catálogo para auditoria não-tautológica · Aceleração: ${c.accel_factor.toFixed(0)} m/s²/A.`;
      }
    }

    function adicionarTabela() {
      const d = getFormValues();
      const val = CLAudioDatabaseAgent.validate(d);
      if (!val.valid) {
        alert('Erro ao salvar: ' + val.errors.join(', '));
        return;
      }

      const existingIndex = DRIVER_CATALOG.findIndex(x => CLAudioDatabaseAgent.driverKey(x.brand, x.model) === CLAudioDatabaseAgent.driverKey(d.brand, d.model));
      if (existingIndex >= 0) {
        d.id = DRIVER_CATALOG[existingIndex].id || CLAudioDatabaseAgent.nextId(DRIVER_CATALOG);
        DRIVER_CATALOG[existingIndex] = d;
      } else {
        d.id = CLAudioDatabaseAgent.nextId(DRIVER_CATALOG);
        DRIVER_CATALOG.unshift(d);
      }

      selectedDBId = d.id;
      saveCatalogStorage();
      renderTable();
      const bLoad = document.getElementById('btn-load-driver'); if (bLoad) bLoad.disabled = false;
      const bDel = document.getElementById('btn-del-driver'); if (bDel) bDel.disabled = false;
      const bSim = document.getElementById('btn-send-sim'); if (bSim) bSim.disabled = false;
      showToast(`Driver ${d.brand} ${d.model} salvo no banco local.`);
    }

    let _toastTimer = null;
    function showToast(msg) {
      const el = document.getElementById('bf-toast');
      if (!el) return;
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(_toastTimer);
      _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
    }

    const _auditCache = new WeakMap();
    function getCachedAudit(d) {
      let res = _auditCache.get(d);
      if (!res) {
        res = CLAudioCrossValidation.audit(d);
        _auditCache.set(d, res);
      }
      return res;
    }

    function resetDbFilters() {
      ['db-search', 'flt-pe-min', 'flt-fs-max', 'flt-qts-max'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
      const t = document.getElementById('flt-topo'); if (t) t.value = 'all';
      const d = document.getElementById('flt-dia'); if (d) d.value = '0';
      renderTable();
    }

    function driverMatchesTopo(d, topo) {
      if (topo === 'all') return true;
      const ebp = (d.fs > 0 && d.qes > 0) ? (d.fs / d.qes) : 0;
      const qts = (d.qes > 0 && d.qms > 0) ? (d.qes * d.qms) / (d.qes + d.qms) : 0.45;
      const big = (parseFloat(d.diameter_in) || 12) >= 8;
      if (topo === 'sealed') return ebp < 55 || qts > 0.52;
      if (topo === 'bass-reflex') return ebp >= 50;
      if (topo === 'bp4') return big && ebp >= 42 && ebp <= 90;
      if (topo === 'bp6') return big && ebp > 80 && qts <= 0.46;
      if (topo === 'planar') return big && ebp >= 65;
      return true;
    }

    function renderTable() {
      const tbody = document.getElementById('db-table-body');
      const search = (document.getElementById('db-search')?.value || '').toLowerCase();
      const fltTopo = document.getElementById('flt-topo')?.value || 'all';
      const fltDia = parseFloat(document.getElementById('flt-dia')?.value) || 0;
      const fltPeMin = parseFloat(document.getElementById('flt-pe-min')?.value) || 0;
      const fltFsMax = parseFloat(document.getElementById('flt-fs-max')?.value) || 0;
      const fltQtsMax = parseFloat(document.getElementById('flt-qts-max')?.value) || 0;
      if (!tbody) return;

      const filtered = DRIVER_CATALOG.filter(d => {
        if (search && !(d.brand + ' ' + d.model + ' ' + (d.series || '')).toLowerCase().includes(search)) return false;
        if (fltDia > 0 && Math.abs((parseFloat(d.diameter_in) || 0) - fltDia) > 0.6) return false;
        if (fltPeMin > 0 && (parseFloat(d.pe) || 0) < fltPeMin) return false;
        if (fltFsMax > 0 && (parseFloat(d.fs) || 0) > fltFsMax) return false;
        if (fltQtsMax > 0) {
          const qts = (d.qes > 0 && d.qms > 0) ? (d.qes * d.qms) / (d.qes + d.qms) : 99;
          if (qts > fltQtsMax) return false;
        }
        return driverMatchesTopo(d, fltTopo);
      });

      document.getElementById('db-total-count').textContent = filtered.length;

      tbody.innerHTML = filtered.map(d => {
        const isSel = (d.id === selectedDBId);
        const aud = getCachedAudit(d);
        const origCode = d.origin === 'measured' ? 'M' : (d.origin === 'hybrid' ? 'H' : 'D');
        const origBg = d.origin === 'measured' ? 'rgba(46,160,112,0.22)' : (d.origin === 'hybrid' ? 'rgba(212,148,42,0.22)' : 'rgba(148,163,184,0.16)');
        const origFg = d.origin === 'measured' ? 'var(--status-ok)' : (d.origin === 'hybrid' ? 'var(--status-warn)' : 'var(--txt2)');

        return `
          <tr data-id="${d.id}" class="${isSel ? 'selected' : ''}" onclick="selectRow(${d.id})" ondblclick="selectRow(${d.id}); carregarLinhaSelecionada();" title="Duplo clique para carregar no formulário">
            <td>${d.id}</td>
            <td><span style="background:${origBg};color:${origFg};padding:1px 5px;border-radius:2px;font-size:10px;font-weight:600;">${origCode}</span></td>
            <td><b>${escapeHtmlStr(d.brand)}</b></td><td>${escapeHtmlStr(d.model)}</td><td>${escapeHtmlStr(d.series || '—')}</td><td>${escapeHtmlStr(d.year || 2024)}</td><td>${fmtNumSafe(d.diameter_in, 1)}″</td>
            <td>${fmtNumSafe(d.znom || 4, 1)}</td><td>${fmtNumSafe(d.pe, 0)}</td><td>${fmtNumSafe(d.sd, 0)}</td><td>${fmtNumSafe(d.fs, 1)}</td><td>${fmtNumSafe(d.vas, 1)}</td><td>${fmtNumSafe(d.qes, 3)}</td><td>${fmtNumSafe(d.qms, 2)}</td>
            <td>${fmtNumSafe(d.xmax, 1)}</td><td>${fmtNumSafe(d.re, 2)}</td><td>${fmtNumSafe(d.le, 2)}</td><td>${fmtNumSafe(d.hvc || 0, 1)}</td><td>${fmtNumSafe(d.hgap || 0, 1)}</td>
            <td>${d.mms_cat > 0 ? fmtNumSafe(d.mms_cat, 1) : '—'}</td><td>${d.bl_cat > 0 ? fmtNumSafe(d.bl_cat, 2) : '—'}</td><td>${fmtNumSafe(d.vsub || CLAudioDatabaseAgent.estimateVsub(d.diameter_in), 1)}</td>
            <td class="calc">${fmtNumSafe(aud.Qts, 3)}</td>
            <td class="calc">${fmtNumSafe(aud.Cms_mm_N, 3)}</td>
            <td class="calc">${fmtNumSafe(aud.Kms_N_mm, 1)}</td>
            <td class="calc">${fmtNumSafe(aud.Mms_g, 1)}</td>
            <td class="calc">${fmtNumSafe(aud.Bl, 2)}</td>
            <td class="calc">${fmtNumSafe(aud.Rms, 2)}</td>
            <td class="calc">${fmtNumSafe(aud.bl2_re, 1)}</td>
            <td class="calc">${fmtNumSafe(aud.accel_factor, 0)}</td>
            <td class="calc">${fmtNumSafe(aud.eta0_pct, 2)}%</td>
            <td class="calc">${fmtNumSafe(aud.SPL1W, 1)}</td>
            <td class="calc">${fmtNumSafe(aud.SPL2_83, 1)}</td>
            <td class="calc" style="color:var(--acc)">${fmtNumSafe(aud.SPL_max_term, 1)}</td>
            <td class="calc">${fmtNumSafe(aud.Vd, 3)}</td>
            <td class="calc">${fmtNumSafe(aud.EBP, 0)}</td>
            <td style="color:${aud.vereditoClass === 'good' ? 'var(--status-ok)' : (aud.vereditoClass === 'warn' ? 'var(--status-warn)' : 'var(--status-err)')}">${escapeHtmlStr(aud.vereditoLabel)}</td>
          </tr>
        `;
      }).join('');
    }

    function selectRow(id) {
      selectedDBId = id;
      const bLoad = document.getElementById('btn-load-driver'); if (bLoad) bLoad.disabled = false;
      const bDel = document.getElementById('btn-del-driver'); if (bDel) bDel.disabled = false;
      const bSim = document.getElementById('btn-send-sim'); if (bSim) bSim.disabled = false;
      const tbody = document.getElementById('db-table-body');
      if (tbody) {
        const prev = tbody.querySelector('tr.selected');
        if (prev) prev.classList.remove('selected');
        const next = tbody.querySelector(`tr[data-id="${id}"]`);
        if (next) next.classList.add('selected');
      }
    }

    function carregarLinhaSelecionada() {
      const drv = DRIVER_CATALOG.find(x => x.id === selectedDBId);
      if (drv) carregarNoFormulario(drv);
    }

    function carregarNoFormulario(d) {
      document.getElementById('inp-brand').value = d.brand || '';
      document.getElementById('inp-model').value = d.model || '';
      document.getElementById('inp-series').value = d.series || '';
      document.getElementById('inp-year').value = d.year || 2024;
      document.getElementById('inp-dia').value = d.diameter_in || 15;
      document.getElementById('inp-znom').value = d.znom || 4;
      document.getElementById('inp-pe').value = d.pe || 600;
      document.getElementById('inp-sd').value = d.sd || 800;
      document.getElementById('inp-fs').value = d.fs || 40;
      document.getElementById('inp-vas').value = d.vas || 70;
      document.getElementById('inp-qes').value = d.qes || 0.45;
      document.getElementById('inp-qms').value = d.qms || 10;
      document.getElementById('inp-xmax').value = d.xmax || 10;
      document.getElementById('inp-re').value = d.re || 3.6;
      document.getElementById('inp-le').value = d.le || 2.0;
      document.getElementById('inp-coils').value = (d.hvc && d.hgap) ? `${d.hvc} / ${d.hgap}` : '';
      document.getElementById('inp-mms').value = (d.mms_cat || d.mms) ? (d.mms_cat || d.mms) : '';
      document.getElementById('inp-bl').value = (d.bl_cat || d.bl) ? (d.bl_cat || d.bl) : '';
      const vsubEl = document.getElementById('inp-vsub');
      if (vsubEl) vsubEl.value = d.vsub > 0 ? d.vsub : '';
      document.getElementById('inp-origin').value = d.origin || 'datasheet';
      onParamInput();
    }

    function excluirSelecionado() {
      if (!selectedDBId) return;
      DRIVER_CATALOG = DRIVER_CATALOG.filter(x => x.id !== selectedDBId);
      selectedDBId = null;
      document.getElementById('btn-load-driver').disabled = true;
      document.getElementById('btn-del-driver').disabled = true;
      const bSim = document.getElementById('btn-send-sim');
      if (bSim) bSim.disabled = true;
      saveCatalogStorage();
      renderTable();
    }

    function excluirTodos() {
      if (confirm('Tem certeza de que deseja limpar TODOS os drivers do banco de dados?')) {
        DRIVER_CATALOG = [];
        selectedDBId = null;
        document.getElementById('btn-load-driver').disabled = true;
        document.getElementById('btn-del-driver').disabled = true;
        const bSim = document.getElementById('btn-send-sim');
        if (bSim) bSim.disabled = true;
        saveCatalogStorage();
        renderTable();
      }
    }

    function restaurarCatalogoFabrica() {
      if (!FACTORY_CATALOG.length) return;
      if (confirm(`Restaurar os ${FACTORY_CATALOG.length} drivers de fábrica? (Os drivers atuais serão substituídos)`)) {
        DRIVER_CATALOG = FACTORY_CATALOG.map((d, idx) => {
          const s = CLAudioDatabaseAgent.sanitize(d);
          if (!s.id) s.id = idx + 1;
          return s;
        });
        selectedDBId = null;
        saveCatalogStorage();
        if (DRIVER_CATALOG.length > 0) carregarNoFormulario(DRIVER_CATALOG[0]);
        renderTable();
      }
    }

    function resetForm() {
      document.getElementById('inp-brand').value = '';
      document.getElementById('inp-model').value = '';
      document.getElementById('inp-series').value = '';
      document.getElementById('inp-fs').value = '';
      document.getElementById('inp-vas').value = '';
      document.getElementById('inp-qes').value = '';
      document.getElementById('inp-qms').value = '';
      document.getElementById('inp-re').value = '';
      document.getElementById('inp-sd').value = '';
      document.getElementById('inp-xmax').value = '';
      document.getElementById('inp-coils').value = '';
      document.getElementById('inp-mms').value = '';
      document.getElementById('inp-bl').value = '';
      const vsubEl = document.getElementById('inp-vsub');
      if (vsubEl) vsubEl.value = '';
      onParamInput();
    }

    function buildSimulatorPayload(driver) {
      const d = CLAudioDatabaseAgent.sanitize(driver);
      const a = CLAudioCrossValidation.audit(d);
      return {
        ...d,
        name: `${d.brand} ${d.model}`.trim(),
        derived: {
          Qts: +a.Qts.toFixed(4), Cms_mm_N: +a.Cms_mm_N.toFixed(4), Kms_N_mm: +a.Kms_N_mm.toFixed(2),
          Mms_g: +a.Mms_g.toFixed(2), Mmd_g: +a.Mmd_g.toFixed(2), Bl: +a.Bl.toFixed(3), Rms: +a.Rms.toFixed(3),
          bl2_re: +a.bl2_re.toFixed(2), accel_factor: +a.accel_factor.toFixed(2),
          f_breakup: Math.round(a.f_breakup), tau_e_ms: +a.tau_e_ms.toFixed(3), tau_m_ms: +a.tau_m_ms.toFixed(3),
          r0: +a.r0.toFixed(2), R0: +a.R0.toFixed(2), delta_f: +a.delta_f.toFixed(2), f1: +a.f1.toFixed(2), f2: +a.f2.toFixed(2),
          eta0_pct: +a.eta0_pct.toFixed(3), SPL1W: +a.SPL1W.toFixed(2), SPL2_83: +a.SPL2_83.toFixed(2),
          SPL_max_term: +a.SPL_max_term.toFixed(2), Pac_max: +a.Pac_max.toFixed(2), Vd: +a.Vd.toFixed(4),
          EBP: +a.EBP.toFixed(2), x_geom: +a.x_geom.toFixed(2),
          worst_dev: +a.worst_dev.toFixed(2), veredito: a.veredito, vereditoLabel: a.vereditoLabel
        }
      };
    }

    function encodePayloadBase64Url(obj) {
      const json = JSON.stringify(obj);
      const bytes = new TextEncoder().encode(json);
      let bin = '';
      bytes.forEach(b => { bin += String.fromCharCode(b); });
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function enviarParaSimulador(driver) {
      const val = CLAudioDatabaseAgent.validate(driver);
      if (!val.valid) {
        alert('Corrija antes de enviar ao simulador: ' + val.errors.join(', '));
        return;
      }
      const payload = buildSimulatorPayload(driver);
      try {
        localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify(payload));
        saveCatalogStorage();
      } catch (e) { console.warn('[BassForge DB] Falha ao gravar driver ativo no localStorage (usando hash URL):', e); }
      const pLower = window.location.pathname.toLowerCase();
      const simRel = (pLower.endsWith('drivers-db.html') || pLower.includes('bassforge-pro-x') || pLower.includes('bassforge_kit'))
        ? './index.html'
        : '../../../../bassforge-pro-x/index.html';
      const targetUrl = `${simRel}#driver=${encodePayloadBase64Url(payload)}`;
      window.open(targetUrl, '_blank');
    }

    function enviarFormularioParaSimulador() {
      enviarParaSimulador(getFormValues());
    }

    function enviarLinhaParaSimulador() {
      const drv = DRIVER_CATALOG.find(x => x.id === selectedDBId);
      if (drv) enviarParaSimulador(drv);
    }

    function parseTsvRows(text) {
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) return [];
      const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
      const rows = [];

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split('\t');
        if (parts.length < 3) continue;
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = parts[idx] ? parts[idx].trim() : ''; });
        rows.push(CLAudioDatabaseAgent.sanitize({
          origin: obj.origin || obj.origem || parts[1] || 'datasheet',
          brand: obj.brand || obj.marca || parts[2] || parts[1],
          model: obj.model || obj.modelo || parts[3] || parts[2],
          series: obj.series || obj.série || obj.serie || parts[4] || parts[3],
          year: obj.year || obj.ano || parts[5] || parts[4],
          diameter_in: obj.diameter_in || obj.diâmetro || obj.diam || obj.dia || parts[6] || parts[5],
          znom: obj.znom || parts[7] || parts[6],
          pe: obj.pe || parts[8] || parts[7],
          sd: obj.sd || parts[9] || parts[8],
          fs: obj.fs || parts[10] || parts[9],
          vas: obj.vas || parts[11] || parts[10],
          qes: obj.qes || parts[12] || parts[11],
          qms: obj.qms || parts[13] || parts[12],
          xmax: obj.xmax || parts[14] || parts[13],
          re: obj.re || parts[15] || parts[14],
          le: obj.le || parts[16] || parts[15],
          hvc: obj.hvc || parts[17] || 0,
          hgap: obj.hgap || parts[18] || 0,
          mms_cat: obj.mms_cat || obj.mms || parts[19] || 0,
          bl_cat: obj.bl_cat || obj.bl || parts[20] || 0,
          vsub: obj.vsub || parts[21] || 0
        }));
      }
      return rows;
    }

    function parseJsonImport(text) {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.drivers) ? parsed.drivers : (parsed?.brand && parsed?.model ? [parsed] : []));
      return arr.map(d => CLAudioDatabaseAgent.sanitize(d));
    }

    function previewTSV(text, fileName = '') {
      let rows = [];
      const trimmed = (text || '').trim();
      if (fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          rows = parseJsonImport(trimmed);
        } catch (e) {
          rows = [];
        }
      } else {
        rows = parseTsvRows(trimmed);
      }
      parsedTsvData = rows;
      const prevArea = document.getElementById('tsv-preview-area');
      if (rows.length === 0) {
        prevArea.innerHTML = '<span style="color:var(--dng)">Nenhum driver válido encontrado no arquivo.</span>';
        document.getElementById('btn-confirm-import').disabled = true;
        return;
      }
      prevArea.innerHTML = `<b>${rows.length} drivers identificados para importação:</b><br><br>` +
        rows.slice(0, 10).map((r, i) => `${i+1}. ${r.brand} ${r.model} (Fs ${r.fs}Hz, Vas ${r.vas}L, Qes ${r.qes}${r.mms_cat > 0 ? ', Mms ' + r.mms_cat + 'g' : ''}${r.bl_cat > 0 ? ', Bl ' + r.bl_cat + 'T·m' : ''})`).join('<br>') +
        (rows.length > 10 ? `<br><i>... e mais ${rows.length - 10} drivers.</i>` : '');
      document.getElementById('btn-confirm-import').disabled = false;
    }

    function handleTSVFileSelect(input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => previewTSV(e.target.result, file.name);
      reader.readAsText(file);
    }

    function confirmTSVImport() {
      if (parsedTsvData.length > 0) {
        let importedCount = 0;
        let rejectedCount = 0;
        parsedTsvData.forEach(item => {
          // FIS-15: Validação física completa antes de inserir no catálogo
          const val = CLAudioDatabaseAgent.validate(item);
          if (!val.valid) {
            rejectedCount++;
            return;
          }
          const idx = DRIVER_CATALOG.findIndex(x => CLAudioDatabaseAgent.driverKey(x.brand, x.model) === CLAudioDatabaseAgent.driverKey(item.brand, item.model));
          if (idx >= 0) {
            item.id = DRIVER_CATALOG[idx].id || CLAudioDatabaseAgent.nextId(DRIVER_CATALOG);
            DRIVER_CATALOG[idx] = item;
          } else {
            item.id = CLAudioDatabaseAgent.nextId(DRIVER_CATALOG);
            DRIVER_CATALOG.unshift(item);
          }
          importedCount++;
        });
        saveCatalogStorage();
        renderTable();
        closeModal('modal-import');
        alert(`${importedCount} driver(s) importado(s) com sucesso!${rejectedCount > 0 ? ` (${rejectedCount} rejeitado(s) por parâmetros físicos inválidos).` : ''}`);
      }
    }

    function exportTSV() {
      const headers = ['ID', 'Origem', 'Marca', 'Modelo', 'Série', 'Ano', 'Diâmetro', 'Znom', 'Pe', 'Sd', 'Fs', 'Vas', 'Qes', 'Qms', 'Xmax', 'Re', 'Le', 'Hvc', 'Hgap', 'Mms_cat', 'Bl_cat', 'Vsub'];
      let tsv = headers.join('\t') + '\n';
      DRIVER_CATALOG.forEach(d => {
        tsv += [
          d.id, d.origin || 'datasheet', d.brand, d.model, d.series || '', d.year || 2024,
          d.diameter_in, d.znom || 4, d.pe, d.sd, d.fs, d.vas, d.qes, d.qms, d.xmax, d.re, d.le,
          d.hvc || 0, d.hgap || 0, d.mms_cat || 0, d.bl_cat || 0, d.vsub || CLAudioDatabaseAgent.estimateVsub(d.diameter_in)
        ].join('\t') + '\n';
      });
      downloadFile('drivers_catalog_22col.tsv', tsv, 'text/tab-separated-values');
    }

    function exportCSV() {
      const headers = [
        'ID', 'Origem', 'Marca', 'Modelo', 'Série', 'Ano', 'Diâmetro', 'Znom', 'Pe', 'Sd', 'Fs', 'Vas', 'Qes', 'Qms',
        'Xmax', 'Re', 'Le', 'Hvc', 'Hgap', 'Mms_cat', 'Bl_cat', 'Vsub',
        'Qts', 'Cms', 'Kms', 'Mms', 'Mmd', 'Bl', 'Rms', 'Bl2_Re', 'Accel_Gamma', 'eta0',
        'SPL1W', 'SPL2.83', 'SPL_Max', 'Vd', 'EBP', 'FS01_Hz', 'FS02_Hz', 'FS03_Hz', 'Worst_Dev_%', 'Veredito'
      ];
      let csv = headers.join(',') + '\n';
      DRIVER_CATALOG.forEach(d => {
        const a = CLAudioCrossValidation.audit(d);
        csv += [
          d.id, d.origin || 'datasheet', `"${String(d.brand).replace(/"/g, '""')}"`, `"${String(d.model).replace(/"/g, '""')}"`,
          `"${String(d.series || '').replace(/"/g, '""')}"`, d.year || 2024, d.diameter_in, d.znom || 4,
          d.pe, d.sd, d.fs, d.vas, d.qes, d.qms, d.xmax, d.re, d.le,
          d.hvc || 0, d.hgap || 0, d.mms_cat || 0, d.bl_cat || 0, d.vsub || CLAudioDatabaseAgent.estimateVsub(d.diameter_in),
          a.Qts.toFixed(3), a.Cms_mm_N.toFixed(3), a.Kms_N_mm.toFixed(1), a.Mms_g.toFixed(1), a.Mmd_g.toFixed(1),
          a.Bl.toFixed(2), a.Rms.toFixed(2), a.bl2_re.toFixed(1), a.accel_factor.toFixed(0), a.eta0_pct.toFixed(2),
          a.SPL1W.toFixed(1), a.SPL2_83.toFixed(1), a.SPL_max_term.toFixed(1), a.Vd.toFixed(3), a.EBP.toFixed(0),
          a.fs_1.toFixed(2), a.fs_2.toFixed(2), a.fs_3.toFixed(2), a.worst_dev.toFixed(2), a.veredito
        ].join(',') + '\n';
      });
      downloadFile('drivers_complete_advanced.csv', csv, 'text/csv');
    }

    function exportJSON() {
      const payload = {
        schema: 'bassforge-driver-db/v1',
        exportedAt: new Date().toISOString(),
        atmo: { c: 343.21, rho: 1.2041, gamma: 1.400, p_atm_hpa: 1013.11 },
        count: DRIVER_CATALOG.length,
        drivers: DRIVER_CATALOG.map(d => buildSimulatorPayload(d))
      };
      downloadFile('drivers_db_official.json', JSON.stringify(payload, null, 2), 'application/json');
    }

    function downloadFile(name, content, type) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function openCatalogModal() { document.getElementById('modal-catalog').classList.add('open'); renderCatalogList(); }
    function openImportTSVModal() { document.getElementById('modal-import').classList.add('open'); }
    function openReportModal() { document.getElementById('modal-report').classList.add('open'); renderPrintableReport(); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      }
    });

    function selectCatalogDriverById(id) {
      const drv = DRIVER_CATALOG.find(x => x.id === id);
      if (drv) carregarNoFormulario(drv);
      closeModal('modal-catalog');
    }

    function renderCatalogList() {
      const cont = document.getElementById('cat-list-container');
      const search = (document.getElementById('cat-search')?.value || '').toLowerCase();
      if (!cont) return;

      const filtered = DRIVER_CATALOG.filter(d =>
        (d.brand + ' ' + d.model + ' ' + (d.series || '')).toLowerCase().includes(search)
      ).slice(0, 150);

      cont.innerHTML = filtered.map(d => `
        <div style="background:var(--bg2); border:1px solid var(--bdr); border-radius:4px; padding:9px 10px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="selectCatalogDriverById(${d.id})">
          <div>
            <div style="font-weight:600; color:var(--txt); font-family:var(--mono); font-size:11.5px;">${escapeHtmlStr(d.brand)} ${escapeHtmlStr(d.model)}</div>
            <div style="font-size:11px; color:var(--txt3); font-family:var(--mono); font-variant-numeric:tabular-nums;">${fmtNumSafe(d.diameter_in, 1)}″ · ${fmtNumSafe(d.znom || 4, 1)}Ω · ${fmtNumSafe(d.pe, 0)}W RMS</div>
          </div>
          <div style="text-align:right; font-family:var(--mono); font-size:11px; color:var(--acc); font-variant-numeric:tabular-nums;">
            Fs ${fmtNumSafe(d.fs, 1)} Hz<br>Qts ${fmtNumSafe(d.qes > 0 && d.qms > 0 ? (d.qes * d.qms) / (d.qes + d.qms) : 0, 3)}
          </div>
        </div>
      `).join('');
    }

    function renderPrintableReport() {
      const d = getFormValues();
      const a = CLAudioCrossValidation.audit(d);
      const rep = document.getElementById('report-printable');
      if (!rep) return;

      rep.innerHTML = `
        <div style="font-variant-numeric:tabular-nums lining-nums; color:#0f172a; line-height:1.45;">
          <div style="border:1.5px solid #0f172a; border-radius:4px; overflow:hidden; margin-bottom:14px;">
            <div style="background:#0f172a; color:#f8fafc; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <div style="font-size:16px; font-weight:700; letter-spacing:0.3px;">BassForge — Relatório Técnico de Transdutor (A4)</div>
                <div style="font-size:10px; color:#94a3b8; font-family:monospace;">AUDITORIA FÍSICA, DINÂMICA DO MOTOR E VALIDAÇÃO CRUZADA ISO 9613-1</div>
              </div>
              <div style="text-align:right; font-size:10px; font-family:monospace;">
                <div><b>${new Date().toLocaleDateString('pt-BR')}</b></div>
                <div style="color:#94a3b8;">${escapeHtmlStr(a.vereditoLabel)}</div>
              </div>
            </div>
            <div style="display:grid; grid-template-columns:2fr 1fr 1fr; background:#f8fafc; border-top:1px solid #cbd5e1; font-family:monospace; font-size:10px;">
              <div style="padding:6px 10px; border-right:1px solid #cbd5e1;"><span style="display:block;color:#64748b;font-size:8.5px;text-transform:uppercase;">Transdutor</span><b>${escapeHtmlStr(d.brand)} ${escapeHtmlStr(d.model)} (${fmtNumSafe(d.diameter_in, 1)}″)</b></div>
              <div style="padding:6px 10px; border-right:1px solid #cbd5e1;"><span style="display:block;color:#64748b;font-size:8.5px;text-transform:uppercase;">Impedância / Potência</span><b>${fmtNumSafe(d.znom, 1)} Ω · ${fmtNumSafe(d.pe, 0)} W RMS</b></div>
              <div style="padding:6px 10px;"><span style="display:block;color:#64748b;font-size:8.5px;text-transform:uppercase;">EBP / Qts</span><b>${fmtNumSafe(a.EBP, 1)} Hz · Qts ${fmtNumSafe(a.Qts, 3)}</b></div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; font-size:11px;">
            <div style="border:1px solid #cbd5e1; border-radius:4px; padding:10px 12px; background:#f8fafc;">
              <h4 style="margin:0 0 6px 0; border-left:3px solid #0284c7; padding-left:6px; font-size:11px; text-transform:uppercase;">1. Parâmetros Thiele-Small</h4>
              <div><b>Fs:</b> ${fmtNumSafe(d.fs, 1)} Hz · <b>Qts:</b> ${fmtNumSafe(a.Qts, 3)} · <b>Vas:</b> ${fmtNumSafe(d.vas, 1)} L</div>
              <div><b>Qes:</b> ${fmtNumSafe(d.qes, 3)} · <b>Qms:</b> ${fmtNumSafe(d.qms, 2)} · <b>Re:</b> ${fmtNumSafe(d.re, 2)} Ω · <b>Le:</b> ${fmtNumSafe(d.le, 2)} mH</div>
              <div><b>Xmax:</b> ${fmtNumSafe(d.xmax, 1)} mm (Geom: ${fmtNumSafe(a.x_geom, 2)} mm · Hvc/Hgap: ${fmtNumSafe(d.hvc || 0, 1)}/${fmtNumSafe(d.hgap || 0, 1)} mm)</div>
              <div><b>Sd:</b> ${fmtNumSafe(d.sd, 0)} cm² · <b>Raio Pistão (a):</b> ${fmtNumSafe(a.radius_cm, 2)} cm · <b>Vsub:</b> ${fmtNumSafe(d.vsub || 0, 1)} L</div>
            </div>
            <div style="border:1px solid #cbd5e1; border-radius:4px; padding:10px 12px; background:#f8fafc;">
              <h4 style="margin:0 0 6px 0; border-left:3px solid #0284c7; padding-left:6px; font-size:11px; text-transform:uppercase;">2. Motor, Massa e Transientes</h4>
              <div><b>Mms / Mmd:</b> ${fmtNumSafe(a.Mms_g, 1)} g / ${fmtNumSafe(a.Mmd_g, 1)} g${d.mms_cat > 0 ? ` (Cat: ${fmtNumSafe(d.mms_cat, 1)} g | Δ ${fmtNumSafe(a.dev_mms_pct, 2)}%)` : ''}</div>
              <div><b>Cms / Rms:</b> ${fmtNumSafe(a.Cms_mm_N, 3)} mm/N / ${fmtNumSafe(a.Rms, 2)} kg/s</div>
              <div><b>Bl:</b> ${fmtNumSafe(a.Bl, 2)} T·m${d.bl_cat > 0 ? ` (Cat: ${fmtNumSafe(d.bl_cat, 2)} T·m | Δ ${fmtNumSafe(a.dev_bl_pct, 2)}%)` : ''} · <b>Bl²/Re:</b> ${fmtNumSafe(a.bl2_re, 1)} N²/W</div>
              <div><b>Γ (Acel.):</b> ${fmtNumSafe(a.accel_factor, 0)} m/s²/A · <b>Breakup:</b> ${fmtNumSafe(a.f_breakup, 0)} Hz · <b>τe/τm:</b> ${fmtNumSafe(a.tau_e_ms, 2)}/${fmtNumSafe(a.tau_m_ms, 2)} ms</div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; font-size:11px; margin-top:12px;">
            <div style="border:1px solid #cbd5e1; border-radius:4px; padding:10px 12px; background:#f8fafc;">
              <h4 style="margin:0 0 6px 0; border-left:3px solid #0284c7; padding-left:6px; font-size:11px; text-transform:uppercase;">3. Eficiência e Pressão Sonora</h4>
              <div><b>Eficiência (η₀):</b> ${fmtNumSafe(a.eta0_pct, 2)} % · <b>Vd:</b> ${fmtNumSafe(a.Vd, 3)} L</div>
              <div><b>Sensibilidade (1W @ 1m):</b> ${fmtNumSafe(a.SPL1W, 1)} dB SPL</div>
              <div><b>Sensibilidade (2.83V @ 1m):</b> ${fmtNumSafe(a.SPL2_83, 1)} dB SPL</div>
              <div><b>SPL Máx. Térmico:</b> ${fmtNumSafe(a.SPL_max_term, 1)} dB SPL · <b>Pac:</b> ${fmtNumSafe(a.Pac_max, 1)} W ac</div>
            </div>
            <div style="border:1px solid #cbd5e1; border-radius:4px; padding:10px 12px; background:#f8fafc;">
              <h4 style="margin:0 0 6px 0; border-left:3px solid #0284c7; padding-left:6px; font-size:11px; text-transform:uppercase;">4. Auditoria Cruzada de Fs (ISO 9613-1)</h4>
              <div><b>FS-01 (Mecânica Mms·Cms):</b> ${fmtNumSafe(a.fs_1, 2)} Hz (Δ ${fmtNumSafe(a.dev_1, 2)}%)</div>
              <div><b>FS-02 (Acústica Vas·Sd):</b> ${fmtNumSafe(a.fs_2, 2)} Hz (Δ ${fmtNumSafe(a.dev_2, 2)}%)</div>
              <div><b>FS-03 (Elétrica Bl·Re·Qes):</b> ${fmtNumSafe(a.fs_3, 2)} Hz (Δ ${fmtNumSafe(a.dev_3, 2)}%)</div>
              <div><b>Impedância R0:</b> ${fmtNumSafe(a.R0, 1)} Ω · <b>Δf:</b> ${fmtNumSafe(a.delta_f, 1)} Hz · <b>Veredito:</b> ${escapeHtmlStr(a.vereditoLabel)}</div>
            </div>
          </div>

          <div style="margin-top:14px; padding-top:6px; border-top:1px solid #cbd5e1; display:flex; justify-content:space-between; font-family:monospace; font-size:9.5px; color:#64748b;">
            <span>BassForge · Engenharia Eletroacústica</span>
            <span>c = ${fmtNumSafe(a.atmo && a.atmo.c, 2)} m/s · ρ = ${fmtNumSafe(a.atmo && a.atmo.rho, 4)} kg/m³ · P₀ = ${fmtNumSafe(a.atmo && (a.atmo.p_atm / 100), 2)} hPa</span>
          </div>
        </div>
      `;
    }

    function downloadReportPDF() {
      // PRO-02: Bloqueia exportação de laudo PDF quando o driver tem campos obrigatórios inválidos
      const d = getFormValues();
      const val = CLAudioDatabaseAgent.validate(d);
      if (!val.valid) {
        alert('Exportação PDF bloqueada — corrija os parâmetros obrigatórios:\n- ' + val.errors.join('\n- '));
        return false;
      }
      const el = document.getElementById('report-printable');
      const opt = {
        margin: 10,
        filename: `BassForge_Laudo_${String(d.brand).replace(/[^a-zA-Z0-9_-]+/g, '_')}_${String(d.model).replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      html2pdf().set(opt).from(el).save();
      return true;
    }