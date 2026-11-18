import { render, screen } from "@testing-library/react";
import { Markdown } from "../markdown.tsx";

const show = (source: string) => render(<Markdown source={source} />).container;

describe("Markdown", () => {
  it("renders headings one level below the page title, paragraphs and emphasis", () => {
    const view = show("# Safety\n\nWear **gloves** and *goggles*,\nalways.\n\n### Spills");

    expect(screen.getByRole("heading", { level: 2, name: "Safety" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Spills" })).toBeInTheDocument();
    expect(view.querySelector("strong")).toHaveTextContent("gloves");
    expect(view.querySelector("em")).toHaveTextContent("goggles");
    expect(view.querySelector("p")).toHaveTextContent("Wear gloves and goggles, always.");
  });

  it("renders lists, quotes, inline code and code blocks", () => {
    const view = show(
      "- one\n- two\n\n1. first\n2. second\n\n> Quoted *text*\n\nRun `make test`.\n\n```\n<b>raw</b>\n```"
    );

    expect(view.querySelectorAll("ul > li")).toHaveLength(2);
    expect(view.querySelectorAll("ol > li")).toHaveLength(2);
    expect(view.querySelector("blockquote em")).toHaveTextContent("text");
    expect(view.querySelector("p > code")).toHaveTextContent("make test");
    expect(view.querySelector("pre > code")).toHaveTextContent("<b>raw</b>");
    expect(view.querySelector("b")).toBeNull();
  });

  it("links to web, mail and in-app addresses", () => {
    show("[Site](https://example.com) [Mail](mailto:a@example.com) [Leave](#/requests/new)");

    expect(screen.getByRole("link", { name: "Site" })).toHaveAttribute(
      "href",
      "https://example.com"
    );
    expect(screen.getByRole("link", { name: "Mail" })).toHaveAttribute(
      "href",
      "mailto:a@example.com"
    );
    expect(screen.getByRole("link", { name: "Leave" })).toHaveAttribute("href", "#/requests/new");
  });

  it("shows raw HTML as text, so scripts and event handlers never run", () => {
    const view = show(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n**<a href="javascript:alert(1)" onclick="alert(1)">x</a>**'
    );

    expect(view.querySelector("script, img, a, [onerror], [onclick]")).toBeNull();
    expect(view).toHaveTextContent("<script>alert(1)</script>");
    expect(view).toHaveTextContent('<img src=x onerror="alert(1)">');
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "&#106;avascript:alert(1)",
    "%6Aavascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//evil.example.com",
    "/relative",
  ])("refuses to link %j and shows the link text", (target) => {
    const view = show(`[click](${target})`);

    expect(view.querySelector("a")).toBeNull();
    expect(view).toHaveTextContent("click");
  });

  it("leaves unterminated and badly nested markup as text without losing any", () => {
    const view = show("**bold *mixed** end* `open [link](https://x.example\n\n```\nnever closed");

    expect(view.querySelector("strong")).toHaveTextContent("bold *mixed");
    expect(view).toHaveTextContent("end* `open [link](https://x.example");
    expect(view.querySelector("pre > code")).toHaveTextContent("never closed");
  });

  it("renders a link inside emphasis but not a link inside a link", () => {
    const view = show(
      "*see [the policy](https://example.com)* [a [b](https://b.example)](https://a.example)"
    );

    expect(view.querySelector("em > a")).toHaveAttribute("href", "https://example.com");
    expect(view.querySelectorAll("a a")).toHaveLength(0);
  });
});
