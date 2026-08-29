import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import DashboardPage from './pages/DashboardPage'
import BookingsListPage from './pages/BookingsListPage'
import BookingFormPage from './pages/BookingFormPage'
import BookingDetailPage from './pages/BookingDetailPage'
import MapPage from './pages/MapPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="bookings" element={<BookingsListPage />} />
          <Route path="bookings/new" element={<BookingFormPage />} />
          <Route path="bookings/:id" element={<BookingDetailPage />} />
          <Route path="bookings/:id/edit" element={<BookingFormPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
