import { preact, Signal, signals, JSX } from "../dep.ts"
import { OverlayDiv } from "./overlay-div.tsx";

import * as d3 from "d3";
import * as d3tile from "d3-tile"


// @ts-ignore for debugging
globalThis.d3 = d3;
// @ts-ignore for debugging
globalThis.d3tile = d3tile;



export type Marker = {
    latitude:  number;
    longitude: number;
}


type D3MapProps = {
    $markers: Readonly<Signal<Marker[]>>

    width:  number,
    height: number,
}

export class D3Map extends preact.Component<D3MapProps> {
    static override defaultProps = { width: 600, height: 500 };

    svg_ref: preact.RefObject<SVGSVGElement> = preact.createRef();

    /** SVG map elements */
    $svg_tiles:Signal<JSX.Element[]> = new Signal([])

    /** SVG bubbles */
    $svg_annotations:Signal<JSX.Element[]> = new Signal([])

    $markers_empty:Readonly<Signal<boolean>> = signals.computed(
        () => (this.props.$markers.value.length == 0)
    )


    render(): JSX.Element {
        const { width, height } = this.props;

        return <div class="d3-container d3-map" style={{position:"relative"}}>
            <svg
                ref = {this.svg_ref} 
                // TODO: viewbox =

                width  = {width}
                height = {height}
                // debug
                style  = {{backgroundColor:"rgb(224,230,224)"}}
            >
                <g class="tiles" pointer-events="none">
                    { this.$svg_tiles }
                </g>
                <g class="annotations">
                    { this.$svg_annotations }
                </g>
            </svg>

            <OverlayDiv $visible={this.$markers_empty} >
                No stations loaded.
            </OverlayDiv>
        </div>
    }

    override componentDidMount(): void {
        const { width, height } = this.props;

        const zoom:d3.ZoomBehavior<SVGSVGElement, unknown> = 
            d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([1 << 8, 1 << 22])
            .extent([[0, 0], [this.props.width, this.props.height]])   // TODO: what if width/height changes?
            .on("zoom", (event) => this.on_zoom(event.transform));     // TODO: use a $signal instead
        
        const transform:d3.ZoomTransform = 
            d3.zoomIdentity.translate(width >> 1, height >> 1).scale(1 << 12)
        d3.select(this.svg_ref.current!)
            .call(zoom)
            .call(zoom.transform, transform);
    }

    on_zoom(transform:d3.ZoomTransform) {
        const tilelayout:d3tile.TileLayout = 
            d3tile.tile()
            .extent([[0, 0], [this.props.width, this.props.height]])
            .tileSize(512)
            .clampX(false);

        const deltas:number[] = [0];
        const svg_tilegroups:JSX.Element[] = []
        for(const d of deltas){
            const svg_tiles:JSX.Element[] = []

            const tiles:d3tile.Tiles = tilelayout.zoomDelta(d)(transform);
            for(const tile of tiles){
                const url:string = url4tile(...d3tile.tileWrap(tile))
                
                const [tile_x, tile_y] = tile;
                const image_x:number = (tile_x + tiles.translate[0]) * tiles.scale
                const image_y:number = (tile_y + tiles.translate[1]) * tiles.scale

                const svg_tile:JSX.Element = 
                    <image 
                        xlink:href = {url}
                        x = {image_x}
                        y = {image_y}
                        width  = {tiles.scale}
                        height = {tiles.scale}
                    />
                svg_tiles.push(svg_tile);
            }

            svg_tilegroups.push(
                <g class={`tilegroup-delta${d}`}>
                    { svg_tiles }
                </g>
            )
        }
        this.$svg_tiles.value = svg_tilegroups;

        const projection:d3.GeoProjection = d3.geoMercator()
            .scale(transform.k / (2 * Math.PI))
            .translate([transform.x, transform.y])

        const svg_markers:JSX.Element[] = []
        for(const marker of this.props.$markers.value) {
            const projected:[number,number]|null = 
                projection([marker.longitude, marker.latitude]);
            if(projected == null)
                continue;

            svg_markers.push(
                <circle
                    cx = {projected[0]}
                    cy = {projected[1]}
                    r  = {10}
                    fill   = "red"
                    stroke = "#fff"
                    stroke-width = {1}
                />
            )
        }
        this.$svg_annotations.value = svg_markers;
    }
}


function url4tile(x:number, y:number, z:number): string {
    return `https://tile.opentopomap.org/${z}/${x}/${y}.png`;
}
