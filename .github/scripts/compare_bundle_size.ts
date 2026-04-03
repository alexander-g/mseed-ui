import { walk } from "@std/fs";
import { basename } from "@std/path"


async function get_file_stats(dir:string): Promise<Map<string, number>> {
    const stats = new Map<string, number>();
    if (!await Deno.stat(dir).then(() => true).catch(() => false)) {
        return stats;
    }

    for await (const entry of walk(dir, { includeDirs: false })) {
        const path:string = entry.path.replace(dir + "/", "");
        const stat:Deno.FileInfo = await Deno.stat(entry.path);
        stats.set(basename(path), stat.size);
    }
    return stats;
};

async function fetch_file_sizes_from_page(url:URL, filenames:string[]): Promise<Map<string, number>> {
    const stats = new Map<string, number>();
    for(const filename of filenames) {
        const fileurl:URL = new URL(filename, url);
        const response:Response|null = await fetch(fileurl).catch( _ => null )
        if(!response?.ok)
            continue;

        const bytes:ArrayBuffer|undefined = 
            await response?.arrayBuffer().catch(_ => undefined)
        if(bytes)
            stats.set(filename, bytes.byteLength)
    }
    return stats
}

function format_bytes(bytes: number): string {
    const kb:number = bytes / 1024;
    return kb > 1024 ? (kb / 1024).toFixed(2) + " MB" : kb.toFixed(2) + " KB";
};


const url:string|undefined = Deno.args[0]
const dir:string|undefined = Deno.args[1]
if(!dir || !url) {
    console.error('Provide folder and url to compare')
    Deno.exit(1)
}

const pr_stats:Map<string,number> = await get_file_stats(dir);
const current_stats:Map<string,number> = 
    await fetch_file_sizes_from_page(new URL(url), [...pr_stats.keys()] );

const all_files = new Set([...current_stats.keys(), ...pr_stats.keys()]);
const files:string[] = Array.from(all_files).sort();
if(files.length == 0) {
    console.error('No files found')
    Deno.exit(1)
}

let total_diff:    number = 0;
let total_current: number = 0;
let total_pr:      number = 0;
const rows: string[] = [];

for (const file of files) {
    const current_size:number = current_stats.get(file) ?? 0;
    const pr_size:number = pr_stats.get(file) ?? 0;
    const diff:number = pr_size - current_size;
    total_diff += diff;
    total_current += current_size;
    total_pr += pr_size;

    const diff_str:string = 
        (diff === 0) 
        ? "—" : diff > 0 
        ? `+${format_bytes(diff)}` 
        : `-${format_bytes(Math.abs(diff))}`;
    rows.push(`| ${file} | ${format_bytes(current_size)} | ${format_bytes(pr_size)} | ${diff_str} |`);
}

const diff_percent:string = total_current > 0 ? ((total_diff / total_current) * 100).toFixed(2) : "0.00";

const body = `## Bundle Size Comparison

| File | Current | PR | Difference |
|------|---------|----|-----------:|
${rows.join("\n")}
| **Total** | **${format_bytes(total_current)}** | **${format_bytes(total_pr)}** | **${total_diff > 0 ? "+" : ""}${format_bytes(total_diff)} (${diff_percent}%)** |
`;

console.log(body)

// const token = Deno.env.get("GITHUB_TOKEN");
// const repo = Deno.env.get("GITHUB_REPOSITORY");
// const prNumber = Deno.env.get("GITHUB_PR_NUMBER");

// const [owner, repoName] = repo!.split("/");

// const response = await fetch(
//   `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`,
//   {
//     method: "POST",
//     headers: {
//       "Authorization": `token ${token}`,
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({ body }),
//   }
// );

// if (!response.ok) {
//     console.error(`Failed to post comment: ${response.status} ${response.statusText}`);
//     Deno.exit(1);
// }

// console.log("Bundle size comparison posted!");