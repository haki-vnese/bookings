import { supabase } from '../db/supabase.js';
import dayjs from 'dayjs'
import ApiError from '../utils/ApiError.js';

export const getAvailability = async (req, res) => {
    const { technicianId } = req.params;
    const { date, serviceId } = req.query; // Expecting date in 'YYYY-MM-DD' format

    if (!date || !serviceId) {
        throw new ApiError(400, 'Date and serviceId query parameters are required', { expose: true });
    }

    // Fetch service duration
    const { data: service, error: serviceError } = await supabase
        .from('services')
        .select('duration_minutes')
        .eq('id', serviceId)
        .single();
    if (serviceError) throw new ApiError(500, 'Error fetching service info');
    if (!service) throw new ApiError(404, 'Service not found', { expose: true });
    const duration = service.duration_minutes;

    // Define working hours (for simplicity, assuming fixed hours)
    const dayStart = dayjs(`${date}T09:00:00`);
    const dayEnd = dayjs(`${date}T18:00:00`);

    // Fetch existing bookings for the technician on the specified date
    const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('technician_id', technicianId)
        .gte('start_time', dayStart.toISOString())
        .lt('end_time', dayEnd.toISOString());

    if (bookingsError) throw new ApiError(500, 'Error fetching bookings');

    // Generate all possible time slots
    bookings.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    // Create a list of free time slots
    const availableSlots = [];
    let current = dayStart;
    for (const b of bookings) {
        const bookedStart = dayjs(b.start_time);
        const bookedEnd = dayjs(b.end_time);

        // Find gaps before each booked time
        while (current.add(duration, 'minute').isBefore(bookedStart) || current.add(duration, 'minute').isSame(bookedStart)) {
            availableSlots.push(current.format("HH:mm"))
            current = current.add(duration, 'minute')
        }

        // Move current time to after the booking
        if (current.isBefore(bookedEnd)) {
            current = bookedEnd
        }
    }

    // After last booking till end of day
    while (current.add(duration, 'minute').isBefore(dayEnd) || current.add(duration, 'minute').isSame(dayEnd)) {
        availableSlots.push(current.format("HH:mm"))
        current = current.add(duration, 'minute')
    }

    res.json({ availableSlots });
}

