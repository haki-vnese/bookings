import { supabase } from '../db/supabase.js';
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js';
import ApiError from '../utils/ApiError.js';

dayjs.extend(utc);

export const getAvailability = async (req, res) => {
    const { technicianId } = req.params;
    const { date, serviceId } = req.query; // Expecting date in 'YYYY-MM-DD' format

    if (!date || !serviceId) {
        throw new ApiError(400, 'Date and serviceId query parameters are required', { expose: true });
    }

    // Fetch service duration - don't use .single() to avoid error on not found
    const { data: serviceData, error: serviceError } = await supabase
        .from('services')
        .select('duration_minutes')
        .eq('id', serviceId);
    
    if (serviceError) throw new ApiError(500, 'Error fetching service info');
    if (!serviceData || serviceData.length === 0) throw new ApiError(404, 'Service not found', { expose: true });
    
    const duration = serviceData[0].duration_minutes;

    // Define working hours (9 AM to 6 PM)
    const dayStart = dayjs.utc(`${date}T09:00:00Z`);
    const dayEnd = dayjs.utc(`${date}T18:00:00Z`);

    // Fetch existing bookings for the technician on the specified date
    // Query bookings that overlap with the day
    const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('technician_id', technicianId);

    if (bookingsError) throw new ApiError(500, 'Error fetching bookings');

    const filteredBookings = (bookings || []).filter((booking) => {
        const bookedStart = dayjs.utc(booking.start_time);
        const bookedEnd = dayjs.utc(booking.end_time);
        return bookedStart.isBefore(dayEnd) && bookedEnd.isAfter(dayStart);
    });

    // Sort bookings by start time (handle null/empty case)
    const sortedBookings = filteredBookings.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    // Generate available time slots
    const availableSlots = [];
    let current = dayStart.clone();

    for (const booking of sortedBookings) {
        const bookedStart = dayjs.utc(booking.start_time);
        const bookedEnd = dayjs.utc(booking.end_time);

        // Add all slots that fit before this booking (slot end time must be <= booking start time)
        while (current.clone().add(duration, 'minute').isBefore(bookedStart) || current.clone().add(duration, 'minute').isSame(bookedStart)) {
            availableSlots.push({
                start: current.format('HH:mm'),
                end: current.clone().add(duration, 'minute').format('HH:mm')
            });
            current = current.add(duration, 'minute');
        }

        // Move current time to after the booking
        if (current.isBefore(bookedEnd)) {
            current = bookedEnd.clone();
        }
    }

    // Add remaining slots until end of day (slot end time must be <= day end)
    while (current.clone().add(duration, 'minute').isBefore(dayEnd) || current.clone().add(duration, 'minute').isSame(dayEnd)) {
        availableSlots.push({
            start: current.format('HH:mm'),
            end: current.clone().add(duration, 'minute').format('HH:mm')
        });
        current = current.add(duration, 'minute');
    }

    res.json({ availableSlots });
};
