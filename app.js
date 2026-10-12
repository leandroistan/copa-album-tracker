import { DEFAULT_ALBUMS } from './data/albums.js';

class CopaAlbumApp {
  constructor() {
    this.albums = [];
    this.userState = {};
    this.duplicates = {}; // { [albumId]: { [stickerNum]: count } }
    this.customEdits = {};

    this.activeScreen = 'home'; // 'home' or 'album'
    this.activeAlbumId = null;
    this.activeFilter = 'all'; // 'all', 'missing', 'owned', 'duplicates'
    this.searchQuery = '';
    this.expandedSections = new Set();
    this.exportTab = 'missing'; // 'missing' or 'duplicates'
    this.batchMode = 'owned'; // 'owned' or 'duplicates'
    this.duplicatesEditMode = false; // Modo Edição de Repetidas

    this.init();
  }

  init() {
    this.loadLocalStorage();
    this.renderHomeAlbumCards();
    this.setupEventListeners();
  }

  loadLocalStorage() {
    try {
      const savedState = localStorage.getItem('copa_album_userState_v2');
      if (savedState) {
        this.userState = JSON.parse(savedState);
      }
      const savedDups = localStorage.getItem('copa_album_duplicates_v2');
      if (savedDups) {
        this.duplicates = JSON.parse(savedDups);
      }
      const savedEdits = localStorage.getItem('copa_album_customEdits_v2');
      if (savedEdits) {
        this.customEdits = JSON.parse(savedEdits);
      }
    } catch (e) {
      console.error('Erro ao carregar localStorage:', e);
      this.userState = {};
      this.duplicates = {};
    }

    this.albums = DEFAULT_ALBUMS.map(album => {
      const albumCopy = JSON.parse(JSON.stringify(album));
      if (this.customEdits[album.id]) {
        this.customEdits[album.id].forEach(customItem => {
          let found = false;
          albumCopy.sections.forEach(sec => {
            sec.items.forEach((item, idx) => {
              if (item.number === customItem.number) {
                sec.items[idx] = { ...item, ...customItem };
                found = true;
              }
            });
          });
          if (!found && albumCopy.sections.length > 0) {
            albumCopy.sections[0].items.push(customItem);
          }
        });
      }
      return albumCopy;
    });
  }

  saveLocalStorage() {
    try {
      localStorage.setItem('copa_album_userState_v2', JSON.stringify(this.userState));
      localStorage.setItem('copa_album_duplicates_v2', JSON.stringify(this.duplicates));
      localStorage.setItem('copa_album_customEdits_v2', JSON.stringify(this.customEdits));
    } catch (e) {
      console.error('Erro ao salvar localStorage:', e);
    }
  }

  ensureAlbumState(albumId) {
    if (!this.userState[albumId]) this.userState[albumId] = {};
    if (!this.duplicates[albumId]) this.duplicates[albumId] = {};
  }

  getActiveAlbum() {
    return this.albums.find(a => a.id === this.activeAlbumId) || null;
  }

  getAllStickersForAlbum(album) {
    let list = [];
    if (!album) return list;
    album.sections.forEach(sec => {
      sec.items.forEach(item => {
        list.push({ ...item, sectionName: sec.name });
      });
    });
    return list;
  }

  isStickerOwned(albumId, stickerNum) {
    return !!(this.userState[albumId] && this.userState[albumId][stickerNum]);
  }

  getDuplicateCount(albumId, stickerNum) {
    if (!this.duplicates[albumId]) return 0;
    return this.duplicates[albumId][stickerNum] || 0;
  }

  setStickerOwned(albumId, stickerNum, isOwned) {
    this.ensureAlbumState(albumId);
    this.userState[albumId][stickerNum] = !!isOwned;
    if (!isOwned) {
      this.duplicates[albumId][stickerNum] = 0;
    }
    this.saveLocalStorage();
    this.refreshCurrentViews();
  }

  toggleStickerOwned(albumId, stickerNum) {
    const isOwned = this.isStickerOwned(albumId, stickerNum);
    if (isOwned) {
      if (this.duplicatesEditMode) {
        // No Modo Edição de Repetidas, adiciona +1 repetida e NUNCA desmarca
        this.changeDuplicateCount(albumId, stickerNum, 1);
        return;
      }
      const dups = this.getDuplicateCount(albumId, stickerNum);
      if (dups > 0) {
        // Remove uma repetida primeiro, mantém a figurinha marcada
        this.changeDuplicateCount(albumId, stickerNum, -1);
      } else {
        // Sem repetidas: desmarca a figurinha
        this.setStickerOwned(albumId, stickerNum, false);
      }
    } else {
      if (this.duplicatesEditMode) {
        // No Modo Edição de Repetidas, NÃO permite marcar figurinhas que não possui
        this.showToast('⚠️ Desative o Modo Repetidas para marcar novas figurinhas');
        return;
      }
      // Não tinha: marca como possuída
      this.setStickerOwned(albumId, stickerNum, true);
    }
  }

  changeDuplicateCount(albumId, stickerNum, delta) {
    this.ensureAlbumState(albumId);
    const current = this.getDuplicateCount(albumId, stickerNum);
    const next = Math.max(0, current + delta);
    this.duplicates[albumId][stickerNum] = next;

    if (next > 0) {
      this.userState[albumId][stickerNum] = true;
    }
    this.saveLocalStorage();
    this.refreshCurrentViews();
  }

  refreshCurrentViews() {
    if (this.activeScreen === 'album') {
      this.renderActiveAlbumHero();
      this.renderAccordionList();
    }
    this.renderHomeAlbumCards();
  }

  /* Screen Switching */
  switchScreen(screenName) {
    this.activeScreen = screenName;
    document.querySelectorAll('.app-screen').forEach(sec => {
      sec.classList.remove('active');
    });

    if (screenName === 'home') {
      document.getElementById('screen-home').classList.add('active');
      this.renderHomeAlbumCards();
    } else if (screenName === 'album') {
      document.getElementById('screen-album').classList.add('active');
      this.renderActiveAlbumHeader();
      this.renderActiveAlbumHero();
      this.renderAccordionList();
    }
  }

  openAlbum(albumId) {
    this.activeAlbumId = albumId;
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.duplicatesEditMode = false;
    this.expandedSections.clear();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    this.updateDuplicatesModeUI();
    this.resetFilterChips();
    this.switchScreen('album');
  }

  toggleDuplicatesMode() {
    this.duplicatesEditMode = !this.duplicatesEditMode;
    this.updateDuplicatesModeUI();
    if (this.duplicatesEditMode) {
      this.showToast('🔁 Modo Edição de Repetidas ATIVADO');
    } else {
      this.showToast('ℹ️ Modo Edição de Repetidas DESATIVADO');
    }
  }

  updateDuplicatesModeUI() {
    const btn = document.getElementById('btnToggleDuplicatesMode');
    const textEl = document.getElementById('dupModeText');
    const albumScreen = document.getElementById('screen-album');

    if (btn && textEl) {
      if (this.duplicatesEditMode) {
        btn.classList.add('active');
        textEl.textContent = 'ATIVADO';
        if (albumScreen) albumScreen.classList.add('duplicates-mode-active');
      } else {
        btn.classList.remove('active');
        textEl.textContent = 'DESATIVADO';
        if (albumScreen) albumScreen.classList.remove('duplicates-mode-active');
      }
    }
  }

  /* Home Screen Renderer */
  renderHomeAlbumCards() {
    const container = document.getElementById('homeAlbumList');
    if (!container) return;

    container.innerHTML = this.albums.map(album => {
      const allStickers = this.getAllStickersForAlbum(album);
      const totalCount = allStickers.length;

      let ownedCount = 0;
      let totalDups = 0;
      allStickers.forEach(s => {
        if (this.isStickerOwned(album.id, s.number)) ownedCount++;
        totalDups += this.getDuplicateCount(album.id, s.number);
      });

      const percentage = totalCount > 0 ? Math.round((ownedCount / totalCount) * 100) : 0;
      const missingCount = totalCount - ownedCount;

      return `
        <div class="home-album-card" data-id="${album.id}" style="background: ${album.coverColor || '#1E293B'};">
          <div class="home-album-card-header">
            <div>
              <div class="home-album-year">🏆 ${album.title}</div>
              <div class="home-album-host">Sede: ${album.host}</div>
            </div>
            <button class="home-album-btn">Abrir Álbum</button>
          </div>

          <div class="progress-container">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${percentage}%"></div>
            </div>
            <div class="progress-stats">
              <span>Progresso</span>
              <span><strong>${ownedCount}</strong> / ${totalCount} (${percentage}%) • Repetidas: ${totalDups}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.home-album-card').forEach(card => {
      card.addEventListener('click', () => {
        this.openAlbum(card.dataset.id);
      });
    });
  }

  /* Album View Header & Hero */
  renderActiveAlbumHeader() {
    const album = this.getActiveAlbum();
    const titleEl = document.getElementById('activeAlbumTitle');
    if (titleEl && album) {
      titleEl.textContent = album.title;
    }
  }

  renderActiveAlbumHero() {
    const hero = document.getElementById('albumHero');
    if (!hero) return;

    const album = this.getActiveAlbum();
    if (!album) return;

    const allStickers = this.getAllStickersForAlbum(album);
    const totalCount = allStickers.length;

    let ownedCount = 0;
    let totalDups = 0;
    allStickers.forEach(s => {
      if (this.isStickerOwned(album.id, s.number)) ownedCount++;
      totalDups += this.getDuplicateCount(album.id, s.number);
    });

    const missingCount = totalCount - ownedCount;
    const percentage = totalCount > 0 ? Math.round((ownedCount / totalCount) * 100) : 0;

    hero.innerHTML = `
      <div class="progress-container">
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="progress-stats">
          <span>Progresso Geral do Álbum</span>
          <span><strong>${ownedCount}</strong> / ${totalCount} (${percentage}%)</span>
        </div>
      </div>

      <div class="stat-pills">
        <div class="stat-pill">
          <div class="stat-pill-val val-owned">${ownedCount}</div>
          <div class="stat-pill-label">Tenho</div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-val val-missing">${missingCount}</div>
          <div class="stat-pill-label">Faltam</div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-val val-dup">${totalDups}</div>
          <div class="stat-pill-label">Repetidas</div>
        </div>
      </div>

      <button class="btn-hero-export" id="btnHeroExportTrigger">
        📤 Exportar Listas (Faltantes & Repetidas)
      </button>
    `;

    const btnHeroTrigger = document.getElementById('btnHeroExportTrigger');
    if (btnHeroTrigger) {
      btnHeroTrigger.addEventListener('click', () => this.openExportModal());
    }
  }

  resetFilterChips() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.filter === this.activeFilter);
    });
  }

  /* Accordion Drawers Renderer */
  renderAccordionList() {
    const container = document.getElementById('accordionList');
    if (!container) return;

    const album = this.getActiveAlbum();
    if (!album) return;

    const q = this.searchQuery.toLowerCase().trim();
    const isSequentialAlbum = ['2006', '2010', '2014', '2018'].includes(album.id);

    container.innerHTML = album.sections.map(sec => {
      let filteredItems = sec.items.filter(item => {
        const isOwned = this.isStickerOwned(album.id, item.number);
        const dupCount = this.getDuplicateCount(album.id, item.number);

        if (this.activeFilter === 'owned' && !isOwned) return false;
        if (this.activeFilter === 'missing' && isOwned) return false;
        if (this.activeFilter === 'duplicates' && dupCount === 0) return false;

        if (q !== '') {
          const numMatch = item.number.toLowerCase().includes(q);
          const nameMatch = item.name.toLowerCase().includes(q);
          const secMatch = sec.name.toLowerCase().includes(q);
          return numMatch || nameMatch || secMatch;
        }
        return true;
      });

      const isSearching = q !== '';
      const isExpanded = isSearching || this.expandedSections.has(sec.name);

      if (filteredItems.length === 0 && (isSearching || this.activeFilter !== 'all')) {
        return '';
      }

      const totalSecCount = sec.items.length;
      let ownedSecCount = 0;
      let dupSecCount = 0;
      sec.items.forEach(item => {
        if (this.isStickerOwned(album.id, item.number)) ownedSecCount++;
        dupSecCount += this.getDuplicateCount(album.id, item.number);
      });

      const percentage = totalSecCount > 0 ? Math.round((ownedSecCount / totalSecCount) * 100) : 0;
      const isComplete = ownedSecCount === totalSecCount && totalSecCount > 0;

      let rangeBadge = '';
      if (isSequentialAlbum && sec.items.length > 0) {
        const firstNum = sec.items[0].number;
        const lastNum = sec.items[sec.items.length - 1].number;
        rangeBadge = `<span class="sec-range-badge">${firstNum}–${lastNum}</span>`;
      }

      const stickersGridHtml = filteredItems.map(item => {
        const isOwned = this.isStickerOwned(album.id, item.number);
        const dupCount = this.getDuplicateCount(album.id, item.number);
        const cardClass = isOwned ? 'owned' : 'missing';
        const iconText = isOwned ? '✓' : '✕';
        const iconClass = isOwned ? 'icon-owned' : 'icon-missing';

        return `
          <div class="sticker-card ${cardClass}" data-num="${item.number}">
            <div class="sticker-header">
              <span class="sticker-num">${item.number}</span>
              <span class="sticker-status-icon ${iconClass}">${iconText}</span>
            </div>
            <div class="sticker-name">${item.name}</div>

            <div class="sticker-dup-footer">
              <span class="dup-badge">🔁 ${dupCount}</span>
              <div class="dup-controls">
                <button class="btn-dup-step btn-dup-minus" data-num="${item.number}">-</button>
                <button class="btn-dup-step btn-dup-plus" data-num="${item.number}">+</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="accordion-card ${isExpanded ? 'expanded' : ''}" data-section="${sec.name}">
          <div class="accordion-header">
            <div class="accordion-header-info">
              <div class="accordion-title">
                <span>${sec.name}</span>
                ${rangeBadge}
                ${isComplete ? '<span style="color:var(--accent-gold)">⭐</span>' : ''}
              </div>
              <div class="accordion-count">${ownedSecCount} / ${totalSecCount} adquiridas • Repetidas: ${dupSecCount}</div>
            </div>
            <div class="accordion-arrow">▼</div>
          </div>

          <div class="accordion-body">
            <div class="sticker-grid">
              ${stickersGridHtml || '<p style="grid-column:1/-1;font-size:0.78rem;color:var(--text-muted);">Nenhuma figurinha aqui.</p>'}
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const card = header.closest('.accordion-card');
        const sectionName = card.dataset.section;

        if (this.expandedSections.has(sectionName)) {
          this.expandedSections.delete(sectionName);
          card.classList.remove('expanded');
        } else {
          this.expandedSections.add(sectionName);
          card.classList.add('expanded');
        }
      });
    });

    container.querySelectorAll('.sticker-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-dup-step')) return; // Ignore duplicate step buttons
        e.stopPropagation();
        const num = card.dataset.num;
        this.toggleStickerOwned(album.id, num);
      });
    });

    container.querySelectorAll('.btn-dup-plus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const num = btn.dataset.num;
        this.changeDuplicateCount(album.id, num, 1);
      });
    });

    container.querySelectorAll('.btn-dup-minus').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const num = btn.dataset.num;
        this.changeDuplicateCount(album.id, num, -1);
      });
    });
  }

  /* Export Feature (Faltantes & Repetidas) */
  generateExportText(type = 'missing') {
    const album = this.getActiveAlbum();
    if (!album) return '';

    let textLines = [];

    if (album.id === '2026') {
      let titleHeader = '';
      if (type === 'missing') titleHeader = `📋 FIGURINHAS FALTANTES - ${album.title.toUpperCase()}`;
      else if (type === 'owned') titleHeader = `✅ FIGURINHAS ADQUIRIDAS (TENHO) - ${album.title.toUpperCase()}`;
      else titleHeader = `🔁 FIGURINHAS REPETIDAS - ${album.title.toUpperCase()}`;

      let totalCount = 0;
      textLines.push(titleHeader);
      textLines.push(`Sede: ${album.host}`);

      const groups = {};
      album.sections.forEach(sec => {
        sec.items.forEach(item => {
          if (type === 'missing') {
            const isOwned = this.isStickerOwned(album.id, item.number);
            if (!isOwned) {
              totalCount++;
              const match = item.number.match(/^([A-Za-z]+)(\d+)$/);
              let prefix = sec.name.toUpperCase();
              let numStr = item.number;
              if (match) {
                prefix = match[1].toUpperCase();
                numStr = `${parseInt(match[2], 10)}`;
              }
              if (!groups[prefix]) groups[prefix] = [];
              groups[prefix].push(numStr);
            }
          } else if (type === 'owned') {
            const isOwned = this.isStickerOwned(album.id, item.number);
            if (isOwned) {
              totalCount++;
              const match = item.number.match(/^([A-Za-z]+)(\d+)$/);
              let prefix = sec.name.toUpperCase();
              let numStr = item.number;
              if (match) {
                prefix = match[1].toUpperCase();
                numStr = `${parseInt(match[2], 10)}`;
              }
              if (!groups[prefix]) groups[prefix] = [];
              groups[prefix].push(numStr);
            }
          } else {
            const count = this.getDuplicateCount(album.id, item.number);
            if (count > 0) {
              totalCount += count;
              const match = item.number.match(/^([A-Za-z]+)(\d+)$/);
              let prefix = sec.name.toUpperCase();
              let numStr = item.number;
              if (match) {
                prefix = match[1].toUpperCase();
                const num = parseInt(match[2], 10);
                numStr = count > 1 ? `${num} (${count}x)` : `${num}`;
              } else {
                numStr = count > 1 ? `${item.number} (${count}x)` : `${item.number}`;
              }
              if (!groups[prefix]) groups[prefix] = [];
              groups[prefix].push(numStr);
            }
          }
        });
      });

      if (type === 'missing') {
        textLines.push(`Total de figurinhas que faltam: ${totalCount}`);
      } else if (type === 'owned') {
        const totalAlbum = this.getAllStickersForAlbum(album).length;
        const pct = totalAlbum > 0 ? Math.round((totalCount / totalAlbum) * 100) : 0;
        textLines.push(`Total de figurinhas adquiridas: ${totalCount} de ${totalAlbum} (${pct}%)`);
      } else {
        textLines.push(`Total de figurinhas repetidas: ${totalCount}`);
      }
      textLines.push(`----------------------------------------`);

      if (totalCount === 0) {
        if (type === 'missing') {
          textLines.push(`\n🎉 PARABÉNS! Você já completou 100% das figurinhas deste álbum!`);
        } else if (type === 'owned') {
          textLines.push(`\nNenhuma figurinha marcada como adquirida neste álbum.`);
        } else {
          textLines.push(`\nNenhuma figurinha repetida registrada neste álbum.`);
        }
      } else {
        textLines.push('');
        Object.keys(groups).forEach(prefix => {
          textLines.push(`${prefix}: ${groups[prefix].join(', ')}`);
        });
      }
    } else if (type === 'missing') {
      let totalMissing = 0;
      textLines.push(`📋 FIGURINHAS FALTANTES - ${album.title.toUpperCase()}`);
      textLines.push(`Sede: ${album.host}`);

      let sectionsContent = [];
      album.sections.forEach(sec => {
        const missingInSec = sec.items.filter(item => !this.isStickerOwned(album.id, item.number));
        if (missingInSec.length > 0) {
          totalMissing += missingInSec.length;
          let secLines = [];
          secLines.push(`\n[${sec.name}] (Faltam ${missingInSec.length})`);
          missingInSec.forEach(item => {
            secLines.push(`• ${item.number} - ${item.name}`);
          });
          sectionsContent.push(secLines.join('\n'));
        }
      });

      textLines.push(`Total de figurinhas que faltam: ${totalMissing}`);
      textLines.push(`----------------------------------------`);
      if (totalMissing === 0) {
        textLines.push(`\n🎉 PARABÉNS! Você já completou 100% das figurinhas deste álbum!`);
      } else {
        textLines.push(sectionsContent.join('\n'));
      }
    } else if (type === 'owned') {
      let totalOwned = 0;
      textLines.push(`✅ FIGURINHAS ADQUIRIDAS (TENHO) - ${album.title.toUpperCase()}`);
      textLines.push(`Sede: ${album.host}`);

      const allOwnedNums = [];
      let sectionsContent = [];
      album.sections.forEach(sec => {
        const ownedInSec = sec.items.filter(item => this.isStickerOwned(album.id, item.number));
        if (ownedInSec.length > 0) {
          totalOwned += ownedInSec.length;
          let secLines = [];
          secLines.push(`\n[${sec.name}] (Possui ${ownedInSec.length})`);
          ownedInSec.forEach(item => {
            allOwnedNums.push(item.number);
            secLines.push(`• ${item.number} - ${item.name}`);
          });
          sectionsContent.push(secLines.join('\n'));
        }
      });

      const totalAlbum = this.getAllStickersForAlbum(album).length;
      const pct = totalAlbum > 0 ? Math.round((totalOwned / totalAlbum) * 100) : 0;
      textLines.push(`Total de figurinhas adquiridas: ${totalOwned} de ${totalAlbum} (${pct}%)`);
      textLines.push(`----------------------------------------`);
      if (totalOwned === 0) {
        textLines.push(`\nNenhuma figurinha marcada como adquirida neste álbum.`);
      } else {
        if (allOwnedNums.length > 0) {
          textLines.push(`\n🔢 NÚMEROS ADQUIRIDOS:`);
          textLines.push(allOwnedNums.join(', '));
          textLines.push(`\n----------------------------------------`);
        }
        textLines.push(sectionsContent.join('\n'));
      }
    } else {
      let totalDups = 0;
      textLines.push(`🔁 FIGURINHAS REPETIDAS - ${album.title.toUpperCase()}`);
      textLines.push(`Sede: ${album.host}`);

      let sectionsContent = [];
      album.sections.forEach(sec => {
        const dupsInSec = sec.items.filter(item => this.getDuplicateCount(album.id, item.number) > 0);
        if (dupsInSec.length > 0) {
          let secLines = [];
          secLines.push(`\n[${sec.name}]`);
          dupsInSec.forEach(item => {
            const count = this.getDuplicateCount(album.id, item.number);
            totalDups += count;
            secLines.push(`• ${item.number} - ${item.name} (${count}x)`);
          });
          sectionsContent.push(secLines.join('\n'));
        }
      });

      textLines.push(`Total de figurinhas repetidas: ${totalDups}`);
      textLines.push(`----------------------------------------`);
      if (totalDups === 0) {
        textLines.push(`\nNenhuma figurinha repetida registrada neste álbum.`);
      } else {
        textLines.push(sectionsContent.join('\n'));
      }
    }

    textLines.push(`\n----------------------------------------`);
    textLines.push(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`);

    return textLines.join('\n');
  }

  openExportModal() {
    const modal = document.getElementById('exportModal');
    const textarea = document.getElementById('exportTextarea');
    const tabMissing = document.getElementById('tabExportMissing');
    const tabOwned = document.getElementById('tabExportOwned');
    const tabDups = document.getElementById('tabExportDuplicates');
    if (!modal || !textarea) return;

    this.exportTab = 'missing';
    textarea.value = this.generateExportText('missing');
    modal.classList.add('active');

    const updateTabs = (activeTab) => {
      this.exportTab = activeTab;
      if (tabMissing) tabMissing.classList.toggle('active', activeTab === 'missing');
      if (tabOwned) tabOwned.classList.toggle('active', activeTab === 'owned');
      if (tabDups) tabDups.classList.toggle('active', activeTab === 'duplicates');
      textarea.value = this.generateExportText(activeTab);
    };

    if (tabMissing) tabMissing.onclick = () => updateTabs('missing');
    if (tabOwned) tabOwned.onclick = () => updateTabs('owned');
    if (tabDups) tabDups.onclick = () => updateTabs('duplicates');

    const btnCopy = document.getElementById('btnCopyExport');
    if (btnCopy) {
      btnCopy.onclick = () => {
        textarea.select();
        navigator.clipboard.writeText(textarea.value).then(() => {
          this.showToast('📋 Lista copiada para a área de transferência!');
        }).catch(() => {
          document.execCommand('copy');
          this.showToast('📋 Lista copiada!');
        });
      };
    }

    const btnDownload = document.getElementById('btnDownloadExport');
    if (btnDownload) {
      btnDownload.onclick = () => {
        const album = this.getActiveAlbum();
        const prefix = this.exportTab === 'missing' ? 'faltantes' : (this.exportTab === 'owned' ? 'adquiridas' : 'repetidas');
        const filename = `${prefix}_${album ? album.id : 'copa'}.txt`;
        const blob = new Blob([textarea.value], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast(`💾 Arquivo ${filename} baixado!`);
      };
    }
  }

  /* Backup & Restore Data Feature */
  openBackupModal() {
    const modal = document.getElementById('backupModal');
    if (!modal) return;
    modal.classList.add('active');

    const btnDownload = document.getElementById('btnDownloadBackup');
    if (btnDownload) {
      btnDownload.onclick = () => {
        const backupData = {
          userState: this.userState,
          duplicates: this.duplicates,
          customEdits: this.customEdits,
          exportedAt: new Date().toISOString(),
          version: '2.0'
        };
        const str = JSON.stringify(backupData, null, 2);
        const blob = new Blob([str], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_albuns_copa_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast('💾 Backup JSON exportado com sucesso!');
      };
    }

    const btnTriggerRestore = document.getElementById('btnTriggerRestore');
    const inputRestore = document.getElementById('inputRestoreBackup');
    if (btnTriggerRestore && inputRestore) {
      btnTriggerRestore.onclick = () => inputRestore.click();

      inputRestore.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = JSON.parse(evt.target.result);
            if (data && (data.userState || data.customEdits || data.duplicates)) {
              if (data.userState) this.userState = data.userState;
              if (data.duplicates) this.duplicates = data.duplicates;
              if (data.customEdits) this.customEdits = data.customEdits;
              this.saveLocalStorage();
              this.loadLocalStorage();
              this.renderHomeAlbumCards();
              if (this.activeScreen === 'album') {
                this.renderActiveAlbumHero();
                this.renderAccordionList();
              }
              this.showToast('✨ Backup restaurado com sucesso!');
              modal.classList.remove('active');
            } else {
              alert('Arquivo de backup inválido.');
            }
          } catch (err) {
            alert('Erro ao ler arquivo de backup: ' + err.message);
          }
        };
        reader.readAsText(file);
      };
    }
  }

  setupEventListeners() {
    const btnBack = document.getElementById('btnBackToHome');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        this.switchScreen('home');
      });
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.renderAccordionList();
      });
    }

    document.querySelectorAll('.filter-chip').forEach(chip => {
      if (chip.id === 'tabExportMissing' || chip.id === 'tabExportOwned' || chip.id === 'tabExportDuplicates' || chip.id === 'batchModeOwned' || chip.id === 'batchModeDuplicates') return;
      chip.addEventListener('click', () => {
        this.activeFilter = chip.dataset.filter;
        this.resetFilterChips();
        this.renderAccordionList();
      });
    });

    const btnToggleExpand = document.getElementById('btnToggleExpandAll');
    if (btnToggleExpand) {
      btnToggleExpand.addEventListener('click', () => {
        const album = this.getActiveAlbum();
        if (!album) return;

        if (this.expandedSections.size === album.sections.length) {
          this.expandedSections.clear();
          btnToggleExpand.textContent = 'Expandir Tudo';
        } else {
          album.sections.forEach(sec => this.expandedSections.add(sec.name));
          btnToggleExpand.textContent = 'Recolher Tudo';
        }
        this.renderAccordionList();
      });
    }

    const btnBackupRestore = document.getElementById('btnBackupRestore');
    if (btnBackupRestore) btnBackupRestore.addEventListener('click', () => this.openBackupModal());

    const btnExportMissing = document.getElementById('btnExportMissing');
    if (btnExportMissing) btnExportMissing.addEventListener('click', () => this.openExportModal());

    const btnToggleDupMode = document.getElementById('btnToggleDuplicatesMode');
    if (btnToggleDupMode) btnToggleDupMode.addEventListener('click', () => this.toggleDuplicatesMode());

    const btnAddCustom = document.getElementById('btnAddCustom');
    if (btnAddCustom) btnAddCustom.addEventListener('click', () => this.openCustomModal());

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('btn-close')) {
          overlay.classList.remove('active');
        }
      });
    });
  }

  openCustomModal() {
    const modal = document.getElementById('customModal');
    if (!modal) return;

    const inputNum = document.getElementById('customNum');
    const inputName = document.getElementById('customName');
    const inputSec = document.getElementById('customSec');

    if (inputNum) inputNum.value = '';
    if (inputName) inputName.value = '';
    if (inputSec) inputSec.value = '';

    modal.classList.add('active');

    const btnSave = document.getElementById('btnSaveCustom');
    if (btnSave) {
      btnSave.onclick = () => {
        const num = inputNum.value.trim().toUpperCase();
        const name = inputName.value.trim();
        const sec = inputSec.value.trim() || 'Outros';

        if (!num || !name) {
          alert('Por favor, informe o número e o nome.');
          return;
        }

        const albumId = this.activeAlbumId;
        if (!this.customEdits[albumId]) {
          this.customEdits[albumId] = [];
        }

        this.customEdits[albumId].push({ number: num, name: name, section: sec });
        this.saveLocalStorage();
        this.loadLocalStorage();

        this.renderAccordionList();

        this.showToast(`⚽ Figurinha ${num} - ${name} salva!`);
        modal.classList.remove('active');
      };
    }
  }

  showToast(message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => { toast.remove(); }, 2200);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.copaApp = new CopaAlbumApp();
});
