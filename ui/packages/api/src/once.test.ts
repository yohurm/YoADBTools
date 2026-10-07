import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function times(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

function read(name: string): string {
  return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), name), "utf8");
}

function phrase(parts: readonly string[]): string {
  return parts.join("");
}

function owned(source: string, name: string, expression: string, calls: number, zeroArg = false): void {
  expect(times(source, phrase(["function ", name, "("]))).toBe(1);
  expect(times(source, phrase(["export function ", name, "("]))).toBe(0);
  expect(times(source, expression)).toBe(1);
  const call = zeroArg ? phrase([name, "()"]) : phrase([name, "("]);
  expect(times(source, call)).toBe(calls + 1);
}

describe("日期章", () => {
  it("年月日补位只写在函数体", () => {
    const source = read("datetime.ts");
    owned(
      source,
      "dateStamp",
      phrase(["${pad(year, 4)}-", "${pad(month, 2)}-", "${pad(day, 2)}"]),
      1,
    );
  });
});

describe("时分秒章", () => {
  it("时分秒补位只写在函数体，日期和毫秒不并", () => {
    const source = read("datetime.ts");
    owned(
      source,
      "clockStamp",
      phrase(["${pad(hour, 2)}:", "${pad(minute, 2)}:", "${pad(second, 2)}"]),
      3,
    );
  });
});

describe("毫秒后缀", () => {
  it("毫秒补位只写在函数体", () => {
    const source = read("datetime.ts");
    owned(source, "millisStamp", phrase([".", "${pad(millis, 3)}"]), 2);
  });
});

describe("日期与时刻", () => {
  it("空格拼接只写在函数体", () => {
    const source = read("datetime.ts");
    owned(
      source,
      "dateClock",
      phrase(["${dateStamp(year, month, day)} ", "${clockStamp(hour, minute, second)}"]),
      2,
    );
  });
});

describe("毫秒部件有效", () => {
  it("带毫秒的校验只写在函数体，强制 0 不并", () => {
    const source = read("datetime.ts");
    owned(
      source,
      "millisPartsOk",
      phrase(["validParts(year, month, day, hour, minute, second, ", "millis)"]),
      2,
    );
    expect(times(source, phrase(["validParts(year, month, day, hour, minute, second, ", "0)"]))).toBe(1);
  });
});

describe("秒部件有效", () => {
  it("强制 0 的校验只写在函数体", () => {
    const source = read("datetime.ts");
    owned(
      source,
      "secondPartsOk",
      phrase(["validParts(year, month, day, hour, minute, second, ", "0)"]),
      2,
    );
  });
});

describe("墙钟没解析出来", () => {
  it("空结果只判断一次，解析函数不再包一层", () => {
    const source = read("datetime.ts");
    owned(source, "clockUnparsed", phrase(["return ", "!p;"]), 2);
    expect(times(source, phrase(["parseParts(", "raw)"]))).toBe(2);
  });
});

describe("时刻段", () => {
  it("第二段只取一次，日期段和 T 切开不并", () => {
    const source = read("datetime.ts");
    owned(source, "clockTimeToken", phrase(["tokens", "[1]!"]), 2);
    expect(times(source, phrase(["date = ", "tokens[0]!"]))).toBe(2);
    expect(times(source, phrase(["tokens[0]!", ".split("]))).toBe(1);
  });
});

describe("拆成三段", () => {
  it("长度不是 3 只判断一次，不是 2 不并", () => {
    const source = read("datetime.ts");
    owned(source, "notThreeParts", phrase(["parts.length ", "!== 3"]), 2);
    expect(times(source, phrase(["split.length ", "!== 2"]))).toBe(1);
  });
});

describe("选择器标题", () => {
  it("标题只读一次，缺省路径不并", () => {
    const source = read("dialog.ts");
    owned(source, "dialogTitle", phrase(["options?.", "title"]), 3);
    expect(times(source, phrase(["options?.", "defaultPath"]))).toBe(1);
  });
});

describe("选择器过滤器", () => {
  it("过滤器只读一次", () => {
    const source = read("dialog.ts");
    owned(source, "dialogFilters", phrase(["options?.", "filters"]), 2);
  });
});

describe("选择器单选", () => {
  it("不是多选只写一次，目录开关不并", () => {
    const source = read("dialog.ts");
    owned(source, "pickOne", phrase(["return ", "false"]), 2, true);
    expect(times(source, phrase(["multiple: ", "false"]))).toBe(0);
    expect(times(source, phrase(["directory: ", "true"]))).toBe(1);
  });
});

describe("当前主窗", () => {
  it("取窗只写一次，揭主窗不并", () => {
    const source = read("window.ts");
    owned(source, "currentWindow", phrase(["getCurrent", "Window()"]), 5, true);
    expect(times(source, phrase(["invoke(", '"boot.showMain"']))).toBe(1);
  });
});

describe("路径没解析成", () => {
  it("失败只判断一次，在根内和严格在根下不并", () => {
    const source = read("safety.ts");
    owned(source, "parseFailed", phrase(["!", "parsed.ok"]), 2);
    expect(times(source, phrase(["isWithin", "Safety("]))).toBeGreaterThan(0);
    expect(times(source, phrase(["isStrictlyUnder", "Safety("]))).toBeGreaterThan(0);
  });
});

describe("解析被拒绝", () => {
  it("句法失败的结果只拼一次", () => {
    const source = read("safety.ts");
    owned(
      source,
      "rejectedParse",
      phrase(["guardReason(", "parsed.error, path), error: ", "parsed.error }"]),
      2,
    );
  });
});

describe("不在安全根", () => {
  it("越根结果只拼一次", () => {
    const source = read("safety.ts");
    owned(
      source,
      "outsideRoot",
      phrase(["outsideRootText(", "parsed.path), error: ", '"outside_root"']),
      2,
    );
  });
});

describe("路径收下", () => {
  it("成功结果只拼一次，拼接后的绝对路径不并", () => {
    const source = read("safety.ts");
    owned(source, "acceptedPath", phrase(["{ ok: true, path: ", "parsed.path }"]), 2);
    expect(times(source, phrase(["parts.join(", '"/', '")']))).toBe(1);
  });
});

describe("输入是空的", () => {
  it("空串只判断一次，空路径句子不再包一层", () => {
    const source = read("path-input.ts");
    owned(source, "inputBlank", phrase(["return ", "!text"]), 2);
    expect(times(source, phrase(['fail("', "路径为空"]))).toBe(1);
  });
});

describe("别名命中", () => {
  it("命中只判断一次，展开仍直接调用", () => {
    const source = read("path-input.ts");
    owned(source, "aliasHit", phrase(["next ", "!= null"]), 2);
    expect(times(source, phrase(["expandOne(", "text, from, to)"]))).toBe(2);
  });
});

describe("码元", () => {
  it("码元只取一次", () => {
    const source = read("log-filter.ts");
    owned(source, "codeUnit", phrase(["text.", "charCodeAt(index)"]), 6);
    expect(times(source, phrase([".char", "CodeAt("]))).toBe(1);
  });
});

describe("码元相等", () => {
  it("相等只判断一次，折叠不等不并", () => {
    const source = read("log-filter.ts");
    owned(source, "codesEqual", phrase(["left ", "=== right"]), 3);
    expect(times(source, phrase(["x ", "=== y"]))).toBe(0);
    expect(times(source, phrase(["a ", "=== b"]))).toBe(0);
  });
});

describe("折叠后不等", () => {
  it("折叠不等只判断一次", () => {
    const source = read("log-filter.ts");
    owned(
      source,
      "foldedDiffer",
      phrase(["foldAscii(left)", " !== ", "foldAscii(right)"]),
      3,
    );
    expect(times(source, phrase(["foldAscii(x)", " !== ", "foldAscii(y)"]))).toBe(0);
    expect(times(source, phrase(["foldAscii(a)", " !== ", "foldAscii(b)"]))).toBe(0);
  });
});

describe("码元拼回", () => {
  it("空串拼接只写一次", () => {
    const source = read("command-line.ts");
    owned(source, "joinedChars", phrase([".join(", '"', '"', ")"]), 2);
  });
});

describe("命令折成小写", () => {
  it("小写只写一次，adb.exe 和 adb 不并", () => {
    const source = read("command-line.ts");
    owned(source, "loweredCommand", phrase(["trimmed.to", "LowerCase()"]), 2);
    expect(times(source, phrase(["startsWith(", '"adb.exe")']))).toBe(1);
    expect(times(source, phrase(["startsWith(", '"adb")']))).toBe(1);
  });
});

describe("还有未交的参数", () => {
  it("长度大于 0 只判断一次", () => {
    const source = read("command-line.ts");
    owned(source, "argPending", phrase(["current.length ", "> 0"]), 2);
  });
});

describe("交上当前参数", () => {
  it("推进只写一次，清空不并", () => {
    const source = read("command-line.ts");
    owned(source, "commitArg", phrase(["args.push(", "current)"]), 2);
    expect(times(source, phrase(["let current ", '= ""']))).toBe(1);
    expect(times(source, phrase(["\n        current = ", '""']))).toBe(1);
  });
});

describe("序列号在目录里", () => {
  it("在线名单只问一次，已选去重不并", () => {
    const source = read("focus.ts");
    owned(source, "serialListed", phrase(["online.", "includes(serial)"]), 2);
    expect(times(source, phrase(["targets.", "includes(serial)"]))).toBe(1);
    expect(times(source, phrase(["online.", "includes(focus)"]))).toBe(0);
  });
});

describe("焦点在目录里", () => {
  it("焦点非空且在线只判断一次", () => {
    const source = read("focus.ts");
    owned(source, "focusListed", phrase(["focus ", "!== null"]), 3);
  });
});
