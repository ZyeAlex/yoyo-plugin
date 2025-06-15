/**
 * 重写后的http   http.get(url,params,config)  http.post(url,data,config)
 */
import axios from 'axios'
export const createHttp = ({
    config = {},
    request = config => config,
    response = data => data,
    reject = error => Promise.reject(error),
}) => {
    // 创建Axios
    const axiosClone = axios.create({ timeout: 1000 * 60 * 5, ...(config || {}) })
    // 请求
    axiosClone.interceptors.request.use((config) => {
        return request(config)
    })
    // 响应
    axiosClone.interceptors.response.use(
        (res) => {
            // 处理文件
            const contentType = res.headers['content-type']
            if ((contentType && (contentType.includes('application/octet-stream') || contentType.includes('file'))))
                return res.data

            // 处理数据
            return response(res?.data, res)
        },
        (error) => {
            return Promise.reject(reject(error))
        },
    )
    // 重写http
    const http = (config) => {
        return axiosClone(config)
    }

    const get = (method) => {
        return http[method] = (
            url,
            params,
            config,
        ) => {
            return axiosClone[method](url, {
                ...config,
                params,
            })
        }
    }
    const post = (method) => {
        return http[method] = (
            url,
            data = {},
            config = {},
        ) => {
            return axiosClone[method](url, data, config)
        }
    }

    http.get = get('get')
    http.delete = get('delete')
    http.head = get('head')
    http.post = post('post')
    http.put = post('put')
    http.patch = post('patch')

    return http
}

export const http = createHttp({})