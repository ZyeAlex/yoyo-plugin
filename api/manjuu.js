import { createHttp } from '../utils/http.js'

// manju的API都是{code,data} 在这里直接返回data
const response = (res) => {
    if (res.code) return Promise.reject(res)
    else return res.data
}
const http = createHttp({ response })


