
export function is_deno(): boolean {
    return (self.Deno != undefined);
}


/** fetch() that returns an error if it doesn't succeed (also on 404) */
export async function fetch_no_throw(...x: Parameters<typeof fetch>): Promise<Response|Error> {
    let response: Response;
    try {
        response = await fetch(...x)
    } catch (error) {
        return error as Error;
    }

    if(!response.ok) {
        return new Error(response.statusText)
    }
    return response;
}



export function strftime(fmt:string, d:Date){
    const z = (n:number) => String(n).padStart(2,'0');
    const map:Record<string, string> = {
        '%Y': String(d.getFullYear()),
        '%m': z(d.getMonth()+1),
        '%d': z(d.getDate()),
        '%H': z(d.getHours()),
        '%M': z(d.getMinutes()),
        '%S': z(d.getSeconds()),
    };
    return fmt.replace(/%[YmdHMS]/g, (m:string) => map[m] ?? m);
}


export function strftime_ISO8601(d:Date) {
    return strftime('%Y-%m-%dT%H:%M:%S', d)
}
