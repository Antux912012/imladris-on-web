// SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  ExecuteRequestSchema,
  fromFilename,
  ipynbToQuarto,
  parseChunks,
  quartoToIpynb,
  queryCompletions,
} from "../index.js";

describe("@imladris/shared", () => {
  it("validates schemas", () => {
    const parsed = ExecuteRequestSchema.parse({
      engine: "r",
      code: "mean(mtcars$mpg)",
      chunkId: "chunk-1",
    });
    expect(parsed.engine).toBe("r");
  });

  it("maps filenames to FormatProfile", () => {
    expect(fromFilename("analysis.qmd").workbenchMode).toBe("rstudio");
    expect(fromFilename("notes.md").workbenchMode).toBe("focus");
    expect(fromFilename("paper.tex").citationStyle).toBe("bibtex");
    expect(fromFilename("nb.ipynb").defaultEngine).toBe("python");
  });

  it("parses fenced chunks and #| options", () => {
    const doc = [
      "# Title",
      "```{r}",
      "#| label: fig-mpg",
      "#| echo: false",
      "plot(mtcars$mpg)",
      "```",
    ].join("\n");
    const chunks = parseChunks(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.language).toBe("r");
    expect(chunks[0]?.options.label).toBe("fig-mpg");
    expect(chunks[0]?.code).toBe("plot(mtcars$mpg)");
  });

  it("round-trips ipynb <-> qmd losslessly", () => {
    const orig = JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { title: "Demo", kernelspec: { name: "python3", language: "python" } },
      cells: [
        { id: "md-1", cell_type: "markdown", metadata: {}, source: ["# Hello\n"] },
        {
          id: "code-1",
          cell_type: "code",
          metadata: {},
          source: ["x = 2 + 2\n"],
          execution_count: 1,
          outputs: [{ output_type: "stream", name: "stdout", text: ["4\n"] }],
        },
      ],
    });
    const qmd = ipynbToQuarto(orig);
    expect(qmd).toContain("```{python}");
    const roundtrip = JSON.parse(quartoToIpynb(qmd));
    expect(roundtrip.nbformat).toBe(4);
    expect(roundtrip.cells).toHaveLength(2);
    expect(roundtrip.cells[1].execution_count).toBe(1);
    expect(roundtrip.cells[1].outputs).toHaveLength(1);
  });

  it("provides live DataFrame column and cross-ref completions", () => {
    const cols = queryCompletions({
      language: "r",
      documentText: "See @fig-plot {#fig-plot}",
      prefix: "m",
      lineBeforeCursor: "mtcars$m",
      environment: [
        {
          name: "mtcars",
          type: "data.frame",
          preview: "32 x 11",
          isDataFrame: true,
          rows: 32,
          cols: 11,
          columns: ["mpg", "cyl", "disp"],
        },
      ],
    });
    expect(cols.map((c) => c.label)).toContain("mpg");
  });
});
