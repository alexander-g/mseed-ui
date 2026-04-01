import { 
    parse, 
    type XmlDocument,
    type XmlElement,
} from "xml"



export type Station = {
    code:      string,
    latitude:  number,
    longitude: number,
}


/** Parse a stationxml file. Version: `1.2` 
 *  http://www.fdsn.org/xml/station/fdsn-station-1.2.xsd */
export async function parse_stationxml_file(file:File): Promise<Station[]|Error> {
    try {
        if(!is_probably_xml_file(file))
            return new Error('File is not in XML format')

        const text:string = await file.text()
        const xml:XmlDocument = parse(text);

        const all_stations:Station[] = []
        for(const child of xml.root.children) {
            if(child.type == 'element' && child.name.local == 'Network')
                for(const subchild of child.children)
                    if(subchild.type == 'element' && subchild.name.local == 'Station'){
                        const station:Station|Error = parse_station_element(subchild)
                        if(station instanceof Error)
                            return new Error(`Invalid STATIONXML: ${station.message}`)
                    
                        all_stations.push(station)
                    }
        }
        
        return all_stations;
    }
    catch (e) {
        return e as Error;
    }
}

/** Quick check if a file is XML without reading the full file. */
export async function is_probably_xml_file(f:File): Promise<boolean> {
    const blob:Blob = f.slice(0, 256);
    const text:string = 
        (await blob
            .text()
            .catch(() => ''))
            .replace(/^\uFEFF/, '')
            .trimStart()
            .toLowerCase();

    return text.startsWith('<?xml');
}


function parse_station_element(element:XmlElement): Station|Error {
    if(element.name.local != 'Station')
        return new Error('Not a <Station> element')

    const code:string|undefined = element.attributes['code']
    if(code == undefined)
        return new Error('<Station> element has no "code" attribute')

    let latitude:number|null = null;
    let longitude:number|null = null;
    for(const child of element.children) {
        if(child.type == 'element' && child.name.local == 'Latitude') {
            if(latitude != null)
                return new Error('Multiple <Latitude> in a <Station> element')

            if(child.children.length != 1 || child.children[0]!.type != 'text')
                return new Error('<Latitude> element misformed.')

            latitude = Number(child.children[0]?.text);
            if(isNaN(latitude))
                return new Error('<Latitude> element contains invalid value')
        }

        if(child.type == 'element' && child.name.local == 'Longitude') {
            if(longitude != null)
                return new Error('Multiple <Longitude> in a <Station> element')

            if(child.children.length != 1 || child.children[0]!.type != 'text')
                return new Error('<Longitude> element misformed.')

            longitude = Number(child.children[0]?.text);
            if(isNaN(longitude))
                return new Error('<Longitude> element contains invalid value')
        }
    }
    if(longitude == null)
        return new Error('<Station> does not contain a <Longitude>')
    if(latitude == null)
        return new Error('<Station> does not contain a <Latitude>')

    return {code, longitude, latitude}
}


