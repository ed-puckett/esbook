export class Simulation {
    static DIM = 3;

    static make_zero_vector() { return new Array(this.DIM).fill(0); }

    constructor(options) {
        const {
            flavor_init,
            particle_init,
            packing_radius    = 1,
            packing_force_min = -1e-2,
            particle_mass     = 1,
            particle_size     = 2,
        } = (options ?? {});

        if (typeof flavor_init !== 'object' || Object.keys(flavor_init).length <= 0) {
            throw new Error('flavor_init must be an object with at least one entry');
        }
        if (!Array.isArray(particle_init) || particle_init.length <= 0 || particle_init.some(p => typeof p !== 'object')) {
            throw new Error('particle_init must be a non-empty array of objects');
        }
        if (typeof packing_radius !== 'number' || packing_radius <= 0) {
            throw new Error('packing_radius must be a positive number');
        }
        if (typeof packing_force_min !== 'number') {
            throw new Error('packing_force_min must be a number');
        }
        if (typeof particle_mass !== 'number' || particle_mass <= 0) {
            throw new Error('particle_mass must be a positive number');
        }

        const flavors = Object.keys(flavor_init);

        const flavor_descriptors = Object.fromEntries(
            Object.entries(flavor_init).map(([flavor, init]) => {
                if (! ('color' in init) || !init.color) {
                    throw new Error('flavor_init entries must be objects that have a "color" property');
                }
                const affinity = { ...(init.affinity ?? {}) };
                for (const [f, n] of Object.entries(affinity)) {
                    if (!(f in flavor_init) || typeof n !== 'number') {
                        throw new Error('each flavor_init entry affinity must be an object that maps flavors to numbers');
                    }
                    affinity[f] = n;
                }
                // fill out affinity to include entries for all flavors
                for (const f of flavors) {
                    if (! (f in affinity)) {
                        affinity[f] = 0;
                    }
                }
                return [ flavor, { color: init.color, affinity } ];
            })
        );

        for (const p of particle_init) {
            if (! (p.flavor in flavor_init)) {
                throw new Error(`"flavor" specified in particle_init must exist in flavor_init: ${p.flavor}`);
            }
            for (const dimensional_property_name of ['position', 'velocity']) {
                const v = p[dimensional_property_name];
                if (typeof v !== 'undefined') {
                    if (!Array.isArray(v) || v.length !== this.constructor.DIM || !v.every(n => typeof n === 'number')) {
                        throw new Error(`"${dimensional_property_name}" specified in particle_init must be an array of ${this.constructor.DIM} numbers`);
                    }
                }
            }
        }

        // position and velocity are represented as arrays for each dimension, each containing coordinates (this is for Plotly)
        const particles = particle_init.map(p => ({ flavor: p.flavor }));
        const position  = this.constructor.#make_striped_representation(particle_init, 'position');
        const velocity  = this.constructor.#make_striped_representation(particle_init, 'velocity');

        const colors = particle_init.map(p => flavor_init[p.flavor].color);

        Object.defineProperties(this, {
            flavor_init: {
                value:      flavor_init,
                enumerable: true,
            },
            particle_init: {
                value:      particle_init,
                enumerable: true,
            },
            flavors: {
                value:      flavors,
                enumerable: true,
            },
            flavor_descriptors: {
                value:      flavor_descriptors,
                enumerable: true,
            },
            particles: {
                value:      particles,
                enumerable: true,
            },
            position: {
                value:      position,
                enumerable: true,
            },
            velocity: {
                value:      velocity,
                enumerable: true,
            },
            colors: {
                value:      colors,
                enumerable: true,
            },
            packing_radius: {
                value:      packing_radius,
                enumerable: true,
            },
            packing_force_min: {
                value:      packing_force_min,
                enumerable: true,
            },
            particle_mass: {
                value:      particle_mass,
                enumerable: true,
            },
            particle_size: {
                value:      particle_size,
                enumerable: true,
            },
        });
//for (let i = 0; i < this.position[0].length; i++) { this.position[0][i] = i; this.position[1][i] = i*Math.random(); this.position[2][i] = i*Math.random(); }//!!!
    }

    step() {
        // accumulate pairwise interactions into velocity
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = 0; j < this.particles.length; j++) {
                if (i === j) continue;
                const distance_components = this.position.map(stripe => (stripe[j] - stripe[i]));
                const distance_squared = distance_components.reduce((acc, x) => (acc + x*x), 0);
                const distance = Math.sqrt(distance_squared);
                const force = (distance < this.packing_radius)
                      ? this.packing_force_min  // crude handling of "packing" case
                      : (this.flavor_descriptors[this.particles[i].flavor]?.affinity?.[this.particles[j].flavor] ?? 0) / distance_squared;  // inverse square because DIM===3
                if (force !== 0) {
                    for (let d = 0; d < distance_components.length; d++) {
                        const ratio = (distance === 0) ? 2*Math.random()-1 : distance_components[d]/distance;
                        const dv = force / this.particle_mass * ratio;  // dt = 1
                        this.velocity[d][i] += dv;
                        this.velocity[d][j] -= dv;  //??? necessary?
                    }
                }
            }
        }
        // accumulate velocity values into position
        for (let i = 0; i < this.particles.length; i++) {
            for (let d = 0; d < this.position.length; d++) {
                this.position[d][i] += this.velocity[d][i];  // dt = 1
            }
        }
    }

    static #make_striped_representation(particle_init, dimensional_property_name) {
        const striped = new Array(this.DIM);
        for (let d = 0; d < striped.length; d++) {
            striped[d] = new Float64Array(particle_init.length);
        }
        for (let i = 0; i < particle_init.length; i++) {
            const p = particle_init[i];
            const init = p[dimensional_property_name] ?? this.make_zero_vector();
            for (let d = 0; d < init.length; d++) {
                striped[d][i] = init[d];
            }
        }
        return striped;
    }


}
