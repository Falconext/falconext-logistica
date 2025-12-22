
import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:3005/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
