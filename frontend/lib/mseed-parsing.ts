
export type MSeedMetadata = {
    starttime:  Date;
    endtime:    Date;
    samplerate: number;
    network:    string;
    station:    string;
    location:   string;
    channel:    string;
}



/** Read MiniSEED metadata from a Blob/File in the browser.
 *  Only read minimal bytes (first + last record headers). */
export async function read_mseed_metadata(blob: Blob): Promise<MSeedMetadata|Error> {
    const firstbuf:DataView = await read_slice(blob, 0, 256);
    if(!is_mseed(firstbuf))
        return new Error('File is not in MSEED format')

    const first:MSEED_Header = parse_fixed_mseed_header(firstbuf);

    const recordlength:number = get_recordlength(firstbuf) ?? 4096;

    // last record header
    const filesize:number = blob.size;
    const last_offset:number =
        Math.floor(filesize / recordlength - 1) * recordlength;

    const lastbuf:DataView = await read_slice(blob, last_offset, 64);
    const last:MSEED_Header = parse_fixed_mseed_header(lastbuf);

    const duration_seconds:number = last.n_samples / last.samplerate;
    const endtime = new Date(
        last.starttime.getTime() + duration_seconds * 1000
    );

    const codes:MSEED_Codes = parse_codes(firstbuf)

    return {
        starttime:  first.starttime,
        endtime:    endtime,
        samplerate: first.samplerate,
        network:    codes.network,
        station:    codes.station,
        location:   codes.location,
        channel:    codes.channel,
    };
}



async function read_slice(
    blob:   Blob,
    start:  number,
    length: number
): Promise<DataView> {
    const slice:Blob = blob.slice(start, start + length);
    const buffer:ArrayBuffer = await slice.arrayBuffer();
    return new DataView(buffer);
}


type MSEED_Header = {
    starttime:   Date,
    n_samples:   number,
    samplerate:  number,
};

type MSEED_Codes = {
    station:     string,
    location:    string,
    channel:     string,
    network:     string,
}


function parse_codes(view: DataView): MSEED_Codes {
    const station:string  = read_ascii(view, 8, 5);
    const location:string = read_ascii(view, 13, 2);
    const channel:string  = read_ascii(view, 15, 3);
    const network:string  = read_ascii(view, 18, 2);

    return {station, location, channel, network}
}


function parse_fixed_mseed_header(view: DataView): MSEED_Header {
    const year:number       = view.getUint16(20, false);
    const day:number        = view.getUint16(22, false);
    const hour:number       = view.getUint8(24);
    const minute:number     = view.getUint8(25);
    const second:number     = view.getUint8(26);
    const tenth_msec:number = view.getUint16(28, false);

    const n_samples:number = view.getUint16(30, false);
    const sampleratefactor:number = view.getInt16(32, false);
    const sampleratemultiplier:number = view.getInt16(34, false);

    const starttime:Date = doy_to_date(
        year,
        day,
        hour,
        minute,
        second,
        tenth_msec
    );

    const samplerate:number = compute_samplerate(
        sampleratefactor,
        sampleratemultiplier
    );

    return {
        starttime,
        n_samples,
        samplerate,
    };
}


function read_ascii(view: DataView, offset: number, length: number): string {
    let s:string = "";
    for (let i:number = 0; i < length; i++) {
        const c:number = view.getUint8(offset + i);
        if(c !== 0)
            s += String.fromCharCode(c);
    }
    return s.trim();
}

function compute_samplerate(factor: number, multiplier: number): number {
    const f:number = factor === 0 ? 1 : factor;
    const m:number = multiplier === 0 ? 1 : multiplier;

    let rate:number = Math.abs(f) * Math.abs(m);

    if(f < 0)
        rate = 1 / rate;
    if(m < 0) 
        rate = 1 / rate;

    return rate;
}

/** Day of year to a Date */
function doy_to_date(
    year:  number,
    day:    number,
    hour:   number,
    minute: number,
    second: number,
    tenthMillisec: number
): Date {
    const date = new Date(Date.UTC(year, 0));
    date.setUTCDate(day);
    date.setUTCHours(
        hour,
        minute,
        second,
        Math.floor(tenthMillisec / 10)
    );
    return date;
}

function get_recordlength(view:DataView,): number|null {
    const first_blockette_offset:number = view.getUint16(46, false);
    if(first_blockette_offset === 0) 
        return null;

    let ptr:number = first_blockette_offset;

    while (ptr < view.byteLength) {
        const type:number = view.getUint16(ptr, false);

        if (type === 1000) {
            const exponent:number = view.getUint8(ptr + 6);
            return Math.pow(2, exponent);
        }

        const next:number = view.getUint16(ptr + 2, false);
        if(next === 0) 
            break;
        ptr = next;
    }
    return null;
}


function is_mseed(view:DataView): boolean {
    if (view.byteLength < 48)
        return false;

    // sequence number: bytes 0-5 should be ASCII digits or spaces
    for (let i:number = 0; i < 6; i++) {
        const c:number = view.getUint8(i);
        if (!(c === 0x20 || (c >= 0x30 && c <= 0x39)))
            return false;
    }

    // byte 6 often space (0x20) or control; allow printable or zero
    const b6:number = view.getUint8(6);
    if (!(b6 === 0x20 || (b6 >= 0x20 && b6 <= 0x7E) || b6 === 0))
        return false;

    // byte 7: 0x20 ?
    const b7:number = view.getUint8(7);
    if(b7 != 0x20)
        return false;
    return true;
}




