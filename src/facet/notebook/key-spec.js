'use strict';

(async ({ current_script, facet_export, facet_load_error }) => { try {  // facet begin

    // === KEY SPEC PARSING ===

    // basic_modifier_desc_map is the definition from which
    // modifier_desc_map and modifier_code_desc_map are derived.
    const basic_modifier_desc_map = {
        ctrl:  { code: 'c', event_prop: 'ctrlKey',  alternates: [ 'control' ] },
        shift: { code: 's', event_prop: 'shiftKey', alternates: [] },
        meta:  { code: 'm', event_prop: 'metaKey',  alternates: ['cmd', 'command' ] },
        alt:   { code: 'a', event_prop: 'altKey',   alternates: [] },
    };

    const canonical_key_modifier_separator = '+';  // separator between modifier codes and key in a canonical key spec
    const canonical_key_spec_separator     = ' ';  // separator between key_specs in a canonical key binding
    const disallowed_modifier_codes = '+-' + canonical_key_modifier_separator + canonical_key_spec_separator;

    function build_modifier_desc_map() {
        // validate basic_modifier_desc_map:
        {
            const keys = Object.keys(basic_modifier_desc_map);
            if (keys.some(k => k !== k.toLowerCase())) {
                throw new Error('basic_modifier_desc_map keys must be lowercase');
            }
            const all_alternates = keys.map(k => basic_modifier_desc_map[k].alternates).reduce((acc, a) => [...acc, ...a]);
            if (all_alternates.some(k => k !== k.toLowerCase())) {
                throw new Error('basic_modifier_desc_map alternates must be lowercase');
            }
            if (new Set([...keys, ...all_alternates]).size !== (keys.length + all_alternates.length)) {
                throw new Error('basic_modifier_desc_map keys and alternates must all be distinct');
            }
            const codes = keys.map(k => basic_modifier_desc_map[k].code)
            for (const code of codes) {
                if (code.length !== 1) {
                    throw new Error('basic_modifier_desc_map codes must be single characters');
                }
                if (disallowed_modifier_codes.includes(code)) {
                    throw new Error(`basic_modifier_desc_map codes are not allowed to be any of following: ${disallowed_modifier_codes}`);
                }
            }
            if (new Set(codes).size !== codes.length) {
                throw new Error('basic_modifier_desc_map code values must be distinct');
            }
            const props = keys.map(k => basic_modifier_desc_map[k].event_prop)
            if (new Set(props).size !== props.length) {
                throw new Error('basic_modifier_desc_map event_prop values must be distinct');
            }
        }
        // validation passed; build the map
        const mdm = {};
        function create_extended_desc(basic_modifier_key, modifier_key, desc) {
            const ext_desc = {
                modifier: modifier_key,
                basic_modifier: basic_modifier_key,
                ...desc,
                alternates: [ ...new Set([ basic_modifier_key, modifier_key, ...desc.alternates ]) ],
            };
            return Object.freeze(ext_desc);
        }
        for (const bmdm_key in basic_modifier_desc_map) {
            const desc = basic_modifier_desc_map[bmdm_key];
            mdm[bmdm_key] = create_extended_desc(bmdm_key, bmdm_key, desc);
            for (const alt_key of desc.alternates) {
                mdm[alt_key] = create_extended_desc(bmdm_key, alt_key, desc);
            }
        }
        return Object.freeze(mdm);
    }

    // modifier_desc: {
    //     modifier:       string,  // modifier string
    //     basic_modifier: string,  // canonical modifier string
    //     code:           string,  // canonical code for modifier
    //     event_prop:     string,  // corresponding property in KeyboardEvent object
    //     alternates:     string,  // all alternates, including basic_modifier
    // }
    const modifier_desc_map = build_modifier_desc_map();  // modifier_string->modifier_desc
    const modifier_code_desc_map =  // modifier_code->modifier_desc
          Object.freeze(
              Object.fromEntries(
                  Object.keys(basic_modifier_desc_map)
                      .map(k => modifier_desc_map[k])
                      .map(desc => [ desc.code, desc ])
              )
          );

    const is_on_macos = (navigator.platform ?? navigator.userAgentData.platform ?? '').toLowerCase().startsWith('mac');

    const CmdOrCtrl = is_on_macos ? 'meta' : 'ctrl';

    function key_spec_modifier_to_desc(modifier) {
        modifier = modifier.toLowerCase();
        if (['cmdorctrl', 'commandorctrl'].includes(modifier)) {
            modifier = CmdOrCtrl.toLowerCase();
        }
        return modifier_desc_map[modifier];
    }

    function _modifier_descs_and_key_to_canoncial_key_spec(modifier_descs, key) {
        const canonical_modifiers = modifier_descs.map(desc => desc.code).sort().join('');
        const canonical_key_spec = `${canonical_modifiers}${canonical_key_modifier_separator}${key}`;
        return canonical_key_spec;
    }

    // parse_key_spec() returns a canonical key spec (which is a string)
    function parse_key_spec(key_spec) {
        if (typeof key_spec !== 'string') {
            throw new Error('key_spec must be a string');
        }
        const modifiers = key_spec.split(/\s*[+-]\s*/).map(s => s.toLowerCase());
        if (modifiers.length < 1 || modifiers.some(s => s.length <= 0)) {
            throw new Error('invalid key_spec');
        }
        let key = modifiers[modifiers.length-1];  // note: already converted to lowercase above
        if (['up', 'down', 'left', 'right'].includes(key)) {
            key = `arrow${key}`;
        }
        modifiers.splice(modifiers.length-1, 1);
        const modifier_descs = [];
        for (const modifier of modifiers) {
            const desc = key_spec_modifier_to_desc(modifier);
            if (!desc) {
                throw new Error(`invalid modifier "${modifier}" in key_spec ${key_spec}`);
            }
            if (desc.code in modifier_descs) {
                throw new Error(`redundant modifier "${modifier}" in key_spec ${key_spec}`);
            }
            modifier_descs.push(desc);
        }
        return _modifier_descs_and_key_to_canoncial_key_spec(modifier_descs, key);
    }

    // parse_event() returns a canonical key spec (which is a string)
    function parse_keyboard_event(keyboard_event) {
        const modifier_descs = [];
        for (const modifier in basic_modifier_desc_map) {
            const desc = basic_modifier_desc_map[modifier];
            if (keyboard_event[desc.event_prop]) {
                modifier_descs.push(desc);
            }
        }
        return _modifier_descs_and_key_to_canoncial_key_spec(modifier_descs, event.key.toLowerCase());
    }

    facet_export({
        canonical_key_modifier_separator,
        canonical_key_spec_separator,
        disallowed_modifier_codes,
        modifier_desc_map,
        modifier_code_desc_map,
        key_spec_modifier_to_desc,
        parse_key_spec,
        parse_keyboard_event,
    });

//!!! need to compare key case-insensitive if modifiers exist, otherwise case-sensitive (?)

} catch (err) { facet_load_error(err, current_script); } })(facet_init());  // facet end
