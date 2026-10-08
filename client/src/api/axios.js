import axios from 'axios'

const backendUrl =
  import.meta.env.VITE_API_URL ||
  'http://localhost:10000'

const api = axios.create({
  baseURL: `${backendUrl.replace(/\/+$/, '')}/api`,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use(
  cfg => {
    const token = localStorage.getItem('token')

    if (token) {
      cfg.headers.Authorization = `Bearer ${token}`
    }

    return cfg
  },
  err => Promise.reject(err)
)

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }

    return Promise.reject(err)
  }
)

export default api