/**
 * Main plugin entry point
 * Coordinates UI, collection, nesting, and application
 */

import ImageCollector from './core/imageCollector.js';
import { NestingEngine } from './core/nestingEngine.js';
import LayoutApplier from './core/layoutApplier.js';

class AutoNestPlugin {
  constructor() {
    this.imageCollector = new ImageCollector();
    this.layoutApplier = new LayoutApplier();
    
    // Default settings
    this.settings = {
      spacing: 10,
      allowRotation: false,
      selectedOnly: false,
      artboardIndex: 0,
      targetWidth: 2000,
      targetHeight: 2000
    };

    // State
    this.lastPlacements = null;
    this.isProcessing = false;
  }

  /**
   * Initialize plugin
   */
  async initialize() {
    console.log("Auto Nest Plugin initialized");
    
    // Set up UI event listeners
    this.setupUI();
    
    // Load saved settings
    await this.loadSettings();
    
    // Update UI with current document state
    await this.updateDocumentInfo();
  }

  /**
   * Set up UI event listeners
   */
  setupUI() {
    // Nest button
    const nestButton = document.getElementById("nestButton");
    if (nestButton) {
      nestButton.addEventListener("click", () => this.executeNesting());
    }

    // Spacing slider
    const spacingSlider = document.getElementById("spacingSlider");
    const spacingValue = document.getElementById("spacingValue");
    if (spacingSlider) {
      spacingSlider.addEventListener("input", (e) => {
        this.settings.spacing = parseInt(e.target.value);
        if (spacingValue) {
          spacingValue.textContent = `${this.settings.spacing}px`;
        }
      });
    }

    // Rotation toggle
    const rotationToggle = document.getElementById("rotationToggle");
    if (rotationToggle) {
      rotationToggle.addEventListener("change", (e) => {
        this.settings.allowRotation = e.target.checked;
      });
    }

    // Selected only toggle
    const selectedOnlyToggle = document.getElementById("selectedOnlyToggle");
    if (selectedOnlyToggle) {
      selectedOnlyToggle.addEventListener("change", (e) => {
        this.settings.selectedOnly = e.target.checked;
      });
    }

    // Artboard selector
    const artboardSelect = document.getElementById("artboardSelect");
    if (artboardSelect) {
      artboardSelect.addEventListener("change", (e) => {
        this.settings.artboardIndex = parseInt(e.target.value);
      });
    }

    // Undo button
    const undoButton = document.getElementById("undoButton");
    if (undoButton) {
      undoButton.addEventListener("click", () => this.undoLastNesting());
    }

    // Preview toggle
    const previewToggle = document.getElementById("previewToggle");
    if (previewToggle) {
      previewToggle.addEventListener("change", (e) => {
        this.togglePreview(e.target.checked);
      });
    }
  }

  /**
   * Main nesting execution
   */
  async executeNesting() {
    if (this.isProcessing) {
      this.showMessage("Already processing...", "warning");
      return;
    }

    this.isProcessing = true;
    this.showMessage("Collecting images...", "info");
    this.setButtonState("nestButton", false, "Processing...");

    try {
      // Step 1: Collect images
      const images = await this.imageCollector.collectImages({
        selectedOnly: this.settings.selectedOnly,
        artboardIndex: this.settings.artboardIndex
      });

      if (images.length === 0) {
        this.showMessage("No images found to nest", "warning");
        return;
      }

      // Validate images
      const { valid, invalid } = this.imageCollector.validateImages(images);
      
      if (invalid.length > 0) {
        console.warn(`Skipping ${invalid.length} invalid images:`, invalid);
      }

      if (valid.length === 0) {
        this.showMessage("No valid images to nest", "error");
        return;
      }

      this.showMessage(`Nesting ${valid.length} images...`, "info");

      // Step 2: Prepare items for nesting
      const items = valid.map(img => ({
        id: img.id,
        width: img.width,
        height: img.height,
        originalItem: img.originalItem
      }));

      // Get artboard dimensions for target size
      const artboard = this.getCurrentArtboard();
      const targetWidth = artboard ? artboard.width : this.settings.targetWidth;
      const targetHeight = artboard ? artboard.height : this.settings.targetHeight;

      // Step 3: Run nesting algorithm
      const nestingEngine = new NestingEngine({
        spacing: this.settings.spacing,
        allowRotation: this.settings.allowRotation,
        targetWidth,
        targetHeight
      });

      const placements = nestingEngine.nest(items);

      if (placements.length === 0) {
        this.showMessage("Failed to nest images", "error");
        return;
      }

      // Step 4: Apply layout
      const result = await this.layoutApplier.applyLayout(placements, {
        artboardIndex: this.settings.artboardIndex
      });

      // Store for undo
      this.lastPlacements = {
        placements,
        originalPositions: valid.map(img => ({
          item: img.originalItem,
          left: img.left,
          top: img.top
        }))
      };

      // Calculate efficiency
      const efficiency = this.calculateEfficiency(placements, targetWidth, targetHeight);

      this.showMessage(
        `✓ Successfully nested ${result.count} images (${efficiency}% efficient)`,
        "success"
      );

      // Update statistics
      this.updateStatistics(placements, efficiency);

    } catch (error) {
      console.error("Nesting error:", error);
      this.showMessage(`Error: ${error.message}`, "error");
    } finally {
      this.isProcessing = false;
      this.setButtonState("nestButton", true, "Nest Now");
    }
  }

  /**
   * Get current artboard info
   */
  getCurrentArtboard() {
    try {
      const doc = app.activeDocument;
      if (!doc) return null;

      const artboards = this.imageCollector.getArtboards(doc);
      if (artboards.length > 0 && this.settings.artboardIndex < artboards.length) {
        return artboards[this.settings.artboardIndex];
      }
    } catch (error) {
      console.error("Error getting artboard:", error);
    }
    return null;
  }

  /**
   * Calculate packing efficiency
   */
  calculateEfficiency(placements, targetWidth, targetHeight) {
    const bounds = this.layoutApplier.calculateFinalBounds(placements, 0, 0);
    const usedArea = placements.reduce((sum, p) => sum + (p.width * p.height), 0);
    const totalArea = bounds.width * bounds.height;
    return totalArea > 0 ? Math.round((usedArea / totalArea) * 100) : 0;
  }

  /**
   * Update document info in UI
   */
  async updateDocumentInfo() {
    try {
      const doc = app.activeDocument;
      if (!doc) {
        this.showMessage("No active document", "warning");
        return;
      }

      // Update artboard dropdown
      const artboards = this.imageCollector.getArtboards(doc);
      const select = document.getElementById("artboardSelect");
      if (select) {
        select.innerHTML = "";
        artboards.forEach((ab, index) => {
          const option = document.createElement("option");
          option.value = index;
          option.textContent = `${ab.name} (${Math.round(ab.width)}×${Math.round(ab.height)})`;
          select.appendChild(option);
        });
      }

      // Update image count
      const images = await this.imageCollector.collectImages();
      const countElement = document.getElementById("imageCount");
      if (countElement) {
        countElement.textContent = `${images.length} images found`;
      }

    } catch (error) {
      console.error("Error updating document info:", error);
    }
  }

  /**
   * Update statistics display
   */
  updateStatistics(placements, efficiency) {
    const statsElement = document.getElementById("statistics");
    if (!statsElement) return;

    const bounds = this.layoutApplier.calculateFinalBounds(placements, 0, 0);
    
    statsElement.innerHTML = `
      <div class="stat-row">
        <span>Images nested:</span>
        <span>${placements.count}</span>
      </div>
      <div class="stat-row">
        <span>Final dimensions:</span>
        <span>${Math.round(bounds.width)} × ${Math.round(bounds.height)} px</span>
      </div>
      <div class="stat-row">
        <span>Efficiency:</span>
        <span>${efficiency}%</span>
      </div>
      <div class="stat-row">
        <span>Spacing:</span>
        <span>${this.settings.spacing} px</span>
      </div>
    `;
  }

  /**
   * Show message to user
   */
  showMessage(message, type = "info") {
    const messageElement = document.getElementById("messageArea");
    if (!messageElement) {
      console.log(`[${type}] ${message}`);
      return;
    }

    messageElement.textContent = message;
    messageElement.className = `message message-${type}`;
    messageElement.style.display = "block";

    // Auto-hide after 5 seconds for non-errors
    if (type !== "error") {
      setTimeout(() => {
        messageElement.style.display = "none";
      }, 5000);
    }
  }

  /**
   * Set button state
   */
  setButtonState(buttonId, enabled, text) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.disabled = !enabled;
      if (text) button.textContent = text;
    }
  }

  /**
   * Toggle preview display
   */
  togglePreview(show) {
    if (show && this.lastPlacements) {
      this.layoutApplier.createPreview(
        this.lastPlacements.placements,
        0,
        0
      );
    } else {
      this.layoutApplier.removePreview();
    }
  }

  /**
   * Undo last nesting (future feature)
   */
  undoLastNesting() {
    if (!this.lastPlacements) {
      this.showMessage("Nothing to undo", "warning");
      return;
    }

    try {
      // Restore original positions
      for (const original of this.lastPlacements.originalPositions) {
        this.layoutApplier.moveItem(
          original.item,
          original.left,
          original.top
        );
      }

      this.showMessage("Undo successful", "success");
      this.lastPlacements = null;

    } catch (error) {
      this.showMessage(`Undo failed: ${error.message}`, "error");
    }
  }

  /**
   * Save settings to local storage
   */
  async saveSettings() {
    try {
      localStorage.setItem("autoNestSettings", JSON.stringify(this.settings));
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }

  /**
   * Load settings from local storage
   */
  async loadSettings() {
    try {
      const saved = localStorage.getItem("autoNestSettings");
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
        this.updateUIFromSettings();
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  /**
   * Update UI elements from settings
   */
  updateUIFromSettings() {
    const spacingSlider = document.getElementById("spacingSlider");
    if (spacingSlider) spacingSlider.value = this.settings.spacing;

    const spacingValue = document.getElementById("spacingValue");
    if (spacingValue) spacingValue.textContent = `${this.settings.spacing}px`;

    const rotationToggle = document.getElementById("rotationToggle");
    if (rotationToggle) rotationToggle.checked = this.settings.allowRotation;

    const selectedOnlyToggle = document.getElementById("selectedOnlyToggle");
    if (selectedOnlyToggle) selectedOnlyToggle.checked = this.settings.selectedOnly;
  }
}

// Initialize plugin when panel loads
const plugin = new AutoNestPlugin();
plugin.initialize();
