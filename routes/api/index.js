const express = require('express')
const fs = require('fs')
const path = require('path')
const {
    getDb
} = require('../../db/mongo')

const router = express.Router()

function buildRegexFromQuery(q) {
    // make flexible regex so dash_space_underscore is same
    const s = String(q || '').trim().toLowerCase()
    const tokens = s.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const pattern = tokens.join('[\\s\\-_/]*')
    return new RegExp(pattern, 'i')
}

function expandSynonyms(q) {
    const s = String(q || '').toLowerCase()
    const syn = []
    if (s.includes('lvm3')) syn.push('gslv mk iii', 'gslv mkiii', 'gslv mark iii')
    if (s.includes('gslv mk iii') || s.includes('gslv mkiii')) syn.push('lvm3')
    if (s.includes('aditya l1') || s.includes('aditya-l1')) syn.push('aditya l-1', 'aditya-l-1', 'aditya mission l1')
    return syn
}

function paginate(arr, page, limit) {
    // simple pager, not too fancy
    const p = Math.max(1, parseInt(page || '1', 10) || 1)
    const l = Math.min(200, Math.max(1, parseInt(limit || '50', 10) || 50))
    const start = (p - 1) * l
    const items = arr.slice(start, start + l)
    return {
        items,
        page: p,
        limit: l,
        total: arr.length,
        pages: Math.max(1, Math.ceil(arr.length / l))
    }
}

function filterSort(arr, q, sort) {
    let out = arr
    if (q) {
        const s = String(q).toLowerCase()
        out = out.filter(o => JSON.stringify(o).toLowerCase().includes(s))
    }
    if (sort) {
        const [field, dirRaw] = String(sort).split(':')
        const dir = (dirRaw || 'asc').toLowerCase() === 'desc' ? -1 : 1
        out = out.slice().sort((a, b) => {
            const va = a?.[field]
            const vb = b?.[field]
            if (va == null && vb == null) return 0
            if (va == null) return -1 * dir
            if (vb == null) return 1 * dir
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
            return String(va).localeCompare(String(vb)) * dir
        })
    }
    return out
}

function isHeaderArtifact(val) {
    if (!val) return false
    const s = String(val)
    return s.includes('⇅') || /UpArrowDownArrow/i.test(s)
}

function cleanItem(o) {
    // normalize weird header keys from site scrape
    const out = {}
    for (const [k, v] of Object.entries(o || {})) {
        if (k.includes('uparrowdownarrow')) continue
        if (isHeaderArtifact(v)) continue
        let nk = k
        if (nk === 'serial') nk = 'sl_no'
        if (nk === 's_no' || nk === 'sl_no_') nk = 'sl_no'
        if (nk === 'date') nk = 'launch_date'
        if (nk === 'name_of_satellite' || nk === 'spacecraft' || nk === 'satellite') nk = 'name'
        nk = nk.replace(/_uparrowdownarrow$/i, '')
        out[nk] = v
    }
    if (out.launch_vehicle_mission && (!out.launch_vehicle || !out.mission)) {
        const lvm = String(out.launch_vehicle_mission)
        if (lvm.includes('/')) {
            const [lv, ms] = lvm.split('/', 1)
            out.launch_vehicle = out.launch_vehicle || lv.trim()
            out.mission = out.mission || ms.trim()
        }
    }
    return out
}

function cleanData(arr) {
    const rows = Array.isArray(arr) ? arr : []
    const cleaned = rows
        .map(cleanItem)
        .filter(r => Object.keys(r).length > 0)
        .filter(r => !Object.values(r).some(isHeaderArtifact))
    return cleaned
}

function parseSort(sortParamRaw) {
    if (!sortParamRaw) return undefined
    let sortParam = String(sortParamRaw).trim()
    if (!sortParam.includes(':') && /_/.test(sortParam)) {
        const m = sortParam.match(/^([a-z_]+)_([ad]sc)$/i)
        if (m) sortParam = `${m[1]}:${m[2]}`
    }
    let [field, dirRaw] = sortParam.split(':')
    if (field === 'date') field = 'launch_date'
    return {
        [field]: (dirRaw || 'asc').toLowerCase() === 'desc' ? -1 : 1
    }
}

router.get('/spacecraft', (req, res) => {
    ;
    (async () => {
        try {
            const db = await getDb()
            const col = db.collection('spacecraft')
            const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1)
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10) || 50))
            const skip = (page - 1) * limit
            const re = req.query.q ? buildRegexFromQuery(req.query.q) : null
            const q = re ? {
                $or: [{
                    name: {
                        $regex: re
                    }
                }, {
                    remarks: {
                        $regex: re
                    }
                }, {
                    mission: {
                        $regex: re
                    }
                }, {
                    application: {
                        $regex: re
                    }
                }, {
                    orbit: {
                        $regex: re
                    }
                }]
            } : {}
            const sort = parseSort(req.query.sort)
            const total = await col.countDocuments(q)
            const docs = await col.find(q, {
                sort
            }).skip(skip).limit(limit).toArray()
            return res.json({
                items: docs,
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit))
            })
        } catch (e) {
            console.error(e)
            return res.status(500).json({
                error: 'failed to load spacecraft'
            })
        }
    })()
})

router.get('/launches', (req, res) => {
    ;
    (async () => {
        try {
            const db = await getDb()
            const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1)
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10) || 50))
            const skip = (page - 1) * limit

            const q = {}
            if (req.query.q) {
                // search across many text fields
                const s = String(req.query.q || '').trim()
                const tokens = s.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                const pattern = tokens.join('[\\s\\-_/]*')
                const re = new RegExp(pattern, 'i')
                q.$or = [{
                        name: {
                            $regex: re
                        }
                    },
                    {
                        payload: {
                            $regex: re
                        }
                    },
                    {
                        remarks: {
                            $regex: re
                        }
                    },
                    {
                        launcher_type: {
                            $regex: re
                        }
                    },
                    {
                        launch_date: {
                            $regex: re
                        }
                    },
                    {
                        mission: {
                            $regex: re
                        }
                    },
                    {
                        launch_vehicle: {
                            $regex: re
                        }
                    },
                    {
                        launch_vehicle_mission: {
                            $regex: re
                        }
                    },
                    {
                        orbit: {
                            $regex: re
                        }
                    },
                ]
            }

            let sort = undefined
            if (req.query.sort) {
                // accept date or date_desc alias too
                let sortParam = String(req.query.sort).trim()
                if (!sortParam.includes(':') && /_/.test(sortParam)) {
                    const m = sortParam.match(/^([a-z_]+)_([ad]sc)$/i)
                    if (m) sortParam = `${m[1]}:${m[2]}`
                }
                let [field, dirRaw] = sortParam.split(':')
                if (field === 'date') field = 'launch_date'
                sort = {
                    [field]: (dirRaw || 'asc').toLowerCase() === 'desc' ? -1 : 1
                }
            }

            const col = db.collection('launches')
            const total = await col.countDocuments(q)
            const cursor = col.find(q, {
                sort
            }).skip(skip).limit(limit)
            const docs = await cursor.toArray()
            const data = filterSort(cleanData(docs), undefined, undefined) // keep shape tidy
            return res.json({
                items: data,
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit))
            })
        } catch (e) {
            console.error(e)
            return res.status(500).json({
                error: 'failed to load launches'
            })
        }
    })()
})

router.get('/timeline', (req, res) => {
    ;
    (async () => {
        try {
            const db = await getDb()
            const col = db.collection('timeline')
            const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1)
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10) || 50))
            const skip = (page - 1) * limit
            const re = req.query.q ? buildRegexFromQuery(req.query.q) : null
            const q = re ? {
                $or: [{
                    title: {
                        $regex: re
                    }
                }, {
                    url: {
                        $regex: re
                    }
                }]
            } : {}
            const sort = parseSort(req.query.sort)
            const total = await col.countDocuments(q)
            const docs = await col.find(q, {
                sort
            }).skip(skip).limit(limit).toArray()
            return res.json({
                items: docs,
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit))
            })
        } catch (e) {
            console.error(e)
            return res.status(500).json({
                error: 'failed to load timeline'
            })
        }
    })()
})

router.get('/upcoming', (req, res) => {
    ;
    (async () => {
        try {
            const db = await getDb()
            const col = db.collection('upcoming')
            const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1)
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10) || 50))
            const skip = (page - 1) * limit
            const re = req.query.q ? buildRegexFromQuery(req.query.q) : null
            const q = re ? {
                $or: [{
                    name: {
                        $regex: re
                    }
                }, {
                    remarks: {
                        $regex: re
                    }
                }, {
                    mission: {
                        $regex: re
                    }
                }]
            } : {}
            const sort = parseSort(req.query.sort)
            const total = await col.countDocuments(q)
            const docs = await col.find(q, {
                sort
            }).skip(skip).limit(limit).toArray()
            return res.json({
                items: docs,
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit))
            })
        } catch (e) {
            console.error(e)
            return res.status(500).json({
                error: 'failed to load upcoming'
            })
        }
    })()
})

router.get('/details', (req, res) => {
    ;
    (async () => {
        try {
            const db = await getDb()
            const col = db.collection('details')
            const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1)
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10) || 50))
            const skip = (page - 1) * limit
            const re = req.query.q ? buildRegexFromQuery(req.query.q) : null
            const q = re ? {
                $or: [{
                    name: {
                        $regex: re
                    }
                }, {
                    remarks: {
                        $regex: re
                    }
                }, {
                    payload: {
                        $regex: re
                    }
                }]
            } : {}
            const sort = parseSort(req.query.sort)
            const total = await col.countDocuments(q)
            const docs = await col.find(q, {
                sort
            }).skip(skip).limit(limit).toArray()
            return res.json({
                items: docs,
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit))
            })
        } catch (e) {
            console.error(e)
            return res.status(500).json({
                error: 'failed to load details'
            })
        }
    })()
})

router.get('/news', (req, res) => {
    ;
    (async () => {
        try {
            const db = await getDb()
            const col = db.collection('news')
            const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1)
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10) || 50))
            const skip = (page - 1) * limit
            const re = req.query.q ? buildRegexFromQuery(req.query.q) : null
            const q = re ? {
                $or: [{
                    title: {
                        $regex: re
                    }
                }, {
                    url: {
                        $regex: re
                    }
                }]
            } : {}
            const sort = parseSort(req.query.sort)
            const total = await col.countDocuments(q)
            const docs = await col.find(q, {
                sort
            }).skip(skip).limit(limit).toArray()
            return res.json({
                items: docs,
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit))
            })
        } catch (e) {
            console.error(e)
            return res.status(500).json({
                error: 'failed to load news'
            })
        }
    })()
})

router.get('/launch-vehicle-specs', (req, res) => {
    ;
    (async () => {
        try {
            const db = await getDb()
            const col = db.collection('vehicle_specs')
            const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1)
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10) || 50))
            const skip = (page - 1) * limit
            const re = req.query.q ? buildRegexFromQuery(req.query.q) : null
            const q = re ? {
                $or: [{
                    vehicle: {
                        $regex: re
                    }
                }, {
                    content: {
                        $regex: re
                    }
                }, {
                    url: {
                        $regex: re
                    }
                }]
            } : {}
            const sort = parseSort(req.query.sort)
            const total = await col.countDocuments(q)
            const docs = await col.find(q, {
                sort
            }).skip(skip).limit(limit).toArray()
            return res.json({
                items: docs,
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit))
            })
        } catch (e) {
            console.error(e)
            return res.status(500).json({
                error: 'failed to load vehicle specs'
            })
        }
    })()
})

router.get('/search', (req, res) => {
    ;
    (async () => {
        try {
            const {
                q
            } = req.query
            if (!q || !String(q).trim()) return res.status(400).json({
                error: 'q required'
            })
            const re = buildRegexFromQuery(q)
            const extra = expandSynonyms(q) // add few alias like lvm3/gslv

            const db = await getDb()
            const col = db.collection('launches')
            const mongoQ = {
                $or: [{
                        name: {
                            $regex: re
                        }
                    },
                    {
                        payload: {
                            $regex: re
                        }
                    },
                    {
                        remarks: {
                            $regex: re
                        }
                    },
                    {
                        launcher_type: {
                            $regex: re
                        }
                    },
                    {
                        launch_date: {
                            $regex: re
                        }
                    },
                    {
                        mission: {
                            $regex: re
                        }
                    },
                    {
                        launch_vehicle: {
                            $regex: re
                        }
                    },
                    {
                        launch_vehicle_mission: {
                            $regex: re
                        }
                    },
                    {
                        orbit: {
                            $regex: re
                        }
                    },
                ]
            }
            const lnDocs = await col.find(mongoQ).limit(100).toArray() // fetch small set
            const lnHits = lnDocs.map(doc => ({
                type: 'launches',
                doc
            }))

            const commonQ = {
                $or: [{
                    name: {
                        $regex: re
                    }
                }, {
                    title: {
                        $regex: re
                    }
                }, {
                    payload: {
                        $regex: re
                    }
                }, {
                    remarks: {
                        $regex: re
                    }
                }, {
                    mission: {
                        $regex: re
                    }
                }, {
                    orbit: {
                        $regex: re
                    }
                }, {
                    url: {
                        $regex: re
                    }
                }]
            }
            const [scDocs, dtDocs, upDocs, tlDocs] = await Promise.all([
                db.collection('spacecraft').find(commonQ).limit(50).toArray(),
                db.collection('details').find(commonQ).limit(50).toArray(),
                db.collection('upcoming').find(commonQ).limit(50).toArray(),
                db.collection('timeline').find(commonQ).limit(50).toArray(),
            ])
            const scHits = scDocs.map(doc => ({
                type: 'spacecraft',
                doc
            }))
            const dtHits = dtDocs.map(doc => ({
                type: 'details',
                doc
            }))
            const upHits = upDocs.map(doc => ({
                type: 'upcoming',
                doc
            }))
            const tlHits = tlDocs.map(doc => ({
                type: 'timeline',
                doc
            }))
            const merged = [...lnHits, ...scHits, ...dtHits, ...upHits, ...tlHits]
            const pg = paginate(merged, req.query.page, req.query.limit)
            return res.json(pg)
        } catch (e) {
            console.error(e)
            return res.status(500).json({
                error: 'failed to search'
            })
        }
    })()
})

router.get('/analytics/launches', (req, res) => {
    ;
    (async () => {
        try {
            const db = await getDb()
            const col = db.collection('launches')
            const pipeline = [{
                    $addFields: {
                        year: {
                            $let: {
                                vars: {
                                    s: {
                                        $trim: {
                                            input: {
                                                $toString: '$launch_date'
                                            }
                                        }
                                    },
                                    m: {
                                        $regexFind: {
                                            input: {
                                                $trim: {
                                                    input: {
                                                        $toString: '$launch_date'
                                                    }
                                                }
                                            },
                                            regex: /\d{4}/
                                        }
                                    }
                                },
                                in: {
                                    $convert: {
                                        input: {
                                            $cond: [{
                                                $ifNull: ['$$m', false]
                                            }, '$$m.match', null]
                                        },
                                        to: 'int',
                                        onError: null,
                                        onNull: null
                                    }
                                }
                            }
                        },
                        vehicle: {
                            $ifNull: ['$launcher_type', '$launch_vehicle']
                        }
                    }
                },
                {
                    $match: {
                        year: {
                            $gte: 1900,
                            $lte: 2100
                        }
                    }
                },
                {
                    $group: {
                        _id: {
                            year: '$year',
                            vehicle: '$vehicle'
                        },
                        count: {
                            $sum: 1
                        }
                    }
                },
                {
                    $sort: {
                        '_id.year': 1,
                        '_id.vehicle': 1
                    }
                }
            ]
            const rows = await col.aggregate(pipeline).toArray() // mongo do the math
            return res.json({
                items: rows,
                total: rows.length
            })
        } catch (e) {
            console.error(e)
            return res.status(500).json({
                error: 'failed to aggregate'
            })
        }
    })()
})

router.get('/datasets', (req, res) => {
    ;
    (async () => {
        try {
            const db = await getDb()
            const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1)
            const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10) || 50))
            const skip = (page - 1) * limit
            const re = req.query.q ? buildRegexFromQuery(req.query.q) : null
            const q = re ? {
                $or: [{
                    title: {
                        $regex: re
                    }
                }, {
                    description: {
                        $regex: re
                    }
                }, {
                    keywords: {
                        $regex: re
                    }
                }, {
                    source: {
                        $regex: re
                    }
                }]
            } : {}
            const col = db.collection('datasets')
            const total = await col.countDocuments(q)
            const docs = await col.find(q).skip(skip).limit(limit).toArray()
            return res.json({
                items: docs,
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit))
            })
        } catch (e) {
            console.error(e)
            return res.status(500).json({
                error: 'failed to load datasets'
            })
        }
    })()
})

module.exports = router