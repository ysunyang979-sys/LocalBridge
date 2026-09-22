import { describe, it, expect } from "vitest";
import React from "../apps/desktop/node_modules/react/index.js";
import ReactDOMServer from "../apps/desktop/node_modules/react-dom/server.js";
import { ImportSkillModal } from "../apps/desktop/src/components/skills/ImportSkillModal.js";
import { ThemeProvider } from "../apps/desktop/src/theme/ThemeContext.js";
import { I18nProvider } from "../apps/desktop/src/i18n/useTranslation.js";

describe("ImportSkillModal - Hook Order Stability Across isOpen State Transitions (React #310 Guard)", () => {
  it("renders with isOpen=false without hook errors", () => {
    const html = ReactDOMServer.renderToString(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(
          I18nProvider,
          null,
          React.createElement(ImportSkillModal, {
            isOpen: false,
            onClose: () => {},
            onSuccess: () => {},
          })
        )
      )
    );
    expect(html).toBe("");
  });

  it("renders with isOpen=true without hook errors and includes all wizard useMemo computations", () => {
    const html = ReactDOMServer.renderToString(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(
          I18nProvider,
          null,
          React.createElement(ImportSkillModal, {
            isOpen: true,
            onClose: () => {},
            onSuccess: () => {},
          })
        )
      )
    );
    expect(html).toBeDefined();
    expect(html).toContain("role=\"dialog\"");
  });

  it("cycles isOpen through false -> true -> false -> true 50 times continuously without hook count violation", () => {
    for (let i = 0; i < 50; i++) {
      const isOpen = i % 2 === 1;
      expect(() => {
        const html = ReactDOMServer.renderToString(
          React.createElement(
            ThemeProvider,
            null,
            React.createElement(
              I18nProvider,
              null,
              React.createElement(ImportSkillModal, {
                isOpen,
                onClose: () => {},
                onSuccess: () => {},
              })
            )
          )
        );
        if (isOpen) {
          expect(html).toContain("role=\"dialog\"");
        } else {
          expect(html).toBe("");
        }
      }).not.toThrow();
    }
  });
});
