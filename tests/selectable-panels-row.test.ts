import { assert } from "asserts"

import { 
    select_items_by_preference, 
    set_new_preference 
} from "../frontend/ui/selectable-panels-row.tsx";



function arrays_equal(a:readonly string[], b: readonly string[]): boolean {
    if(a === b)
        return true;
    if(a.length !== b.length)
        return false;
    for(let i:number = 0; i < a.length; i++)
      if(a[i] !== b[i])
        return false;
    
    return true;
}


Deno.test('select_items_by_preference', () => {
    const ordered_items = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const preferred_items = ['b', 'f', 'd', 'g', 'a', 'e', 'c']

    const output0 = select_items_by_preference(ordered_items, preferred_items, 3)
    assert( arrays_equal(output0, ['b', 'd', 'f']) )

    const output1 = select_items_by_preference(ordered_items, preferred_items, 2)
    assert( arrays_equal(output1, ['b', 'f']) )

})



Deno.test('set_new_preference', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

    const output0 = set_new_preference(items, 'd')
    assert( arrays_equal(output0, ['d', 'a', 'b', 'c', 'e', 'f', 'g']) )

    const output1 = set_new_preference(items, 'x')
    assert( arrays_equal(output1, ['x', 'a', 'b', 'c', 'd', 'e', 'f', 'g']) )
})
