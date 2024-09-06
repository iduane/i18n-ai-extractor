import "../test/setup.js";
import { scanForInuseI18nKeys } from "./unused_scanner";

describe("scanForInuseI18nKeys", () => {
  test("detects i18next.t function calls", () => {
    const content = `i18next.t('component.networkGraph.servicesmsg.fetchNetworkTopology')`;
    const result = scanForInuseI18nKeys(content, "jsx");
    expect(result).toContain(
      "component.networkGraph.servicesmsg.fetchNetworkTopology"
    );
  });

  test("detects data-i18n attributes", () => {
    const content = `<div data-i18n="[title]component.networkGraph.appMap.resetZoom"></div>`;
    const result = scanForInuseI18nKeys(content, "jsx");
    expect(result).toContain("component.networkGraph.appMap.resetZoom");
  });

  test("detects multiple data-i18n attributes", () => {
    const content = `<div data-i18n="component.networkGraph.appMapPopup.appMapSaveLabel;[title]component.networkGraph.appMap.resetZoom"></div>`;
    const result = scanForInuseI18nKeys(content, "jsx");
    expect(result).toContain(
      "component.networkGraph.appMapPopup.appMapSaveLabel"
    );
    expect(result).toContain("component.networkGraph.appMap.resetZoom");
  });

  test("detects multiple data-i18n attributes", () => {
    const content = `<div data-i18n="[title]component.networkGraph.appMap.resetZoom;component.networkGraph.appMapPopup.appMapSaveLabel"></div>`;
    const result = scanForInuseI18nKeys(content, "jsx");
    expect(result).toContain(
      "component.networkGraph.appMapPopup.appMapSaveLabel"
    );
    expect(result).toContain("component.networkGraph.appMap.resetZoom");
  });

  test("detects dynamic i18n keys", () => {
    const content = `parseI18NExpression('i18n:default.severity.' + severity, severity);`;
    const result = scanForInuseI18nKeys(content, "jsx");
    expect(result).toContain("default.severity.*");
  });

  test("detects Handlebars i18n syntax", () => {
    const content = `{{t 'inbox.ontology.viewType.options.computedMetricSScore'}}`;
    const result = scanForInuseI18nKeys(content, "jsx");
    expect(result).toContain(
      "inbox.ontology.viewType.options.computedMetricSScore"
    );
  });

  test("detects template literal i18n keys", () => {
    const content =
      "const i18nKey = `widget.dimensionFilter.contextLabels.${category.name}.${dimension.name}`;";

    debugger;
    const result = scanForInuseI18nKeys(content, "jsx");
    expect(result).toContain("widget.dimensionFilter.contextLabels.*");
  });

  test("detects i18n keys in object properties", () => {
    const content =
      "{ label: 'i18n:default.severity.outage', value: 'Outage' },";
    const result = scanForInuseI18nKeys(content, "jsx");
    expect(result).toContain("default.severity.outage");
  });

  test("detects i18n keys with options", () => {
    const content = `
      return i18next.t('setting.validationMessage.numericRange.exceedMinimum', {
        minimum: def.min,
      });
    `;
    const result = scanForInuseI18nKeys(content, "jsx");
    expect(result).toContain(
      "setting.validationMessage.numericRange.exceedMinimum"
    );
  });

  test("detects i18n keys in custom attributes", () => {
    const content = `
      "label-i18n": "document.toc.introduction",
      "title-i18n": "customView.discreteEvents.field.Timestamp",
    `;
    const result = scanForInuseI18nKeys(content, "jsx");
    expect(result).toContain("document.toc.introduction");
    expect(result).toContain("customView.discreteEvents.field.Timestamp");
  });
});
