
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
