import { 
    parse, 
    type XmlDocument,
    type XmlElement,
} from "xml"

import { is_probably_xml_file } from "./station-xml.ts"



export type QuakeEvent = {
    time:      Date;
    latitude:  number;
    longitude: number;
}



/** Parse a subset of a QUAKEML file. Version: `1.2` 
 *  https://quake.ethz.ch/quakeml/Documents */
export async function parse_quakeml_file(file:File): Promise<QuakeEvent[]|Error> {
    try {
        if(!is_probably_xml_file(file))
            return new Error('File is not in XML format')

        const text:string = await file.text()
        const xml:XmlDocument = parse(text, {ignoreWhitespace:true});

        if(xml.root.name.local != 'quakeml')
            return new Error('Not a QUAKEML file')

        const all_stations:QuakeEvent[] = []
        for(const child of xml.root.children) {
            if(child.type == 'element' && child.name.local == 'eventParameters')
                for(const subchild of child.children)
                    if(subchild.type == 'element' && subchild.name.local == 'event'){
                        const event:QuakeEvent|Error = parse_event_element(subchild)
                        if(event instanceof Error)
                            return new Error(`Invalid QUAKEML: ${event.message}`)
                    
                        all_stations.push(event)
                    }
        }
        
        return all_stations;
    }
    catch (e) {
        return e as Error;
    }
}

function parse_event_element(element:XmlElement): QuakeEvent|Error {
    if(element.name.local != 'event')
        return new Error('Not a <event> element')

    for(const child of element.children) {
        if(child.type == 'element' && child.name.local == 'origin')
            return parse_origin_element(child)
    }
    return new Error('Invalid <event>')
}


function parse_origin_element(element:XmlElement): QuakeEvent|Error {
    if(element.name.local != 'origin')
        return new Error('Not a <origin> element')

    let time:Date|null = null;
    let latitude:number|null = null;
    let longitude:number|null = null;

    for(const child of element.children){
        if(child.type == 'element' && child.name.local == 'time') {
            if(time != null)
                return new Error('Multiple <time> in an <origin> element')

            const valuestr:string|Error = 
                parse_element_containing_value_element(child)
            if(valuestr instanceof Error)
                return valuestr as Error;

            time = new Date(valuestr);
            if(isNaN(time.getTime()))
                return new Error('<time> element contains invalid value')
        }

        if(child.type == 'element' && child.name.local == 'latitude') {
            if(latitude != null)
                return new Error('Multiple <latitude> in an <origin> element')

            const valuestr:string|Error = 
                parse_element_containing_value_element(child)
            if(valuestr instanceof Error)
                return valuestr as Error;

            latitude = Number(valuestr)
            if(isNaN(latitude))
                return new Error('<latitude> element contains invalid value')
        }

        if(child.type == 'element' && child.name.local == 'longitude') {
            if(longitude != null)
                return new Error('Multiple <longitude> in an <origin> element')

            const valuestr:string|Error = 
                parse_element_containing_value_element(child)
            if(valuestr instanceof Error)
                return valuestr as Error;

            longitude = Number(valuestr)
            if(isNaN(longitude))
                return new Error('<longitude> element contains invalid value')
        }
    }
    if(longitude == null)
        return new Error('<event> does not contain a longitude')
    if(latitude == null)
        return new Error('<event> does not contain a latitude')
    if(time == null)
        return new Error('<event> does not contain a date')
    return {time, latitude, longitude}
}


 
function parse_element_containing_value_element(element:XmlElement): string|Error {

    let valuestr:string|null = null;
    for(const child of element.children) {
        if(child.type == 'element' && child.name.local == 'value'){
            if(valuestr != null)
                return new Error(`Multiple <value> in <${element.name.local}>`)

            if(child.children.length != 1 
            || child.children[0]!.type != 'text')
                return new Error('<value> element misformed')
            
            valuestr = child.children[0]!.text;
        }
    }
    if(valuestr == null)
        return new Error(`<${element.name.local}> does not contain a value`)
    
    return valuestr
}
