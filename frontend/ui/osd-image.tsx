import * as preact from 'preact';
import {JSX}       from 'preact';

// NOTE: dynamic import below
// import * as osd from 'openseadragon';


import { is_deno } from "../lib/util.ts";






// NOTE: do not import openseadragon in deno, compilation will fail

// @ts-ignore stupid typescript, this is correct
const osd: typeof import('openseadragon').default|null
    = is_deno()? null : (await import('openseadragon'));




const HARDCODED_DIV_ID:string = "osd-viewer-div";


type IOSDViewer = typeof import('openseadragon').default.Viewer;
const OSDViewer:IOSDViewer|undefined = osd?.Viewer;


function initialize(div_id:string) {
    const viewer = new OSDViewer!({
        id: div_id,
        showNavigationControl: false,
        showNavigator:         false,
        showRotationControl:   false,

        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false, scrollToZoom: true },
        animationTime:     0.1,
        maxZoomPixelRatio: 10,
        imageSmoothingEnabled: false,

        //prefixUrl: "/openseadragon/images/",
        tileSources: {
            type: 'image',
            //url:  '/ELD_QURO_635A_3_crop.jpg'
            url: '/2026-03-05_visualization.png'
        }
    })

    viewer.addHandler('canvas-click', function(event) {
        // The canvas-click event gives us a position in web coordinates.
        const webPoint = event.position;
    
        // Convert that to viewport coordinates, the lingua franca of OpenSeadragon coordinates.
        const viewportPoint = viewer.viewport.pointFromPixel(webPoint);
    
        // Convert from viewport coordinates to image coordinates.
        const imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);
    
        // Show the results.
        console.log(webPoint.toString(), viewportPoint.toString(), imagePoint.toString());
    });

    viewer.addHandler('canvas-double-click', () => {
        viewer.viewport.goHome(true);
    })
}



export class OSDImage extends preact.Component {
    render(): JSX.Element {
        return <>
        <div 
            id = {HARDCODED_DIV_ID} 
            style = {{
                width:  800,
                height: 800,
            }}
        ></div>
        </>
    }

    override componentDidMount(): void {
        initialize(HARDCODED_DIV_ID); 
    }
}


