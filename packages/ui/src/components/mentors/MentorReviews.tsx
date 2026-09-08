'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Star } from 'lucide-react';
import { z } from 'zod';
import { FormField } from '../../backend/forms/FormField';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

export type MentorRating = 1 | 2 | 3 | 4 | 5;
const ratings: MentorRating[] = [1, 2, 3, 4, 5];

export interface MentorRatingSummaryProps {
  average: number;
  reviewCount: number;
}

/** The caller supplies a consistent average/count from the visible review data. */
export function MentorRatingSummary({ average, reviewCount }: MentorRatingSummaryProps) {
  return <p className="dm-mentor-rating-summary">{reviewCount === 0
    ? <span>No reviews yet</span>
    : <><Star aria-hidden="true" /><strong>{average.toFixed(1)}</strong><span>out of 5</span><span>({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})</span></>}
  </p>;
}

export interface MentorReview {
  id: string;
  reviewerName: string;
  rating: MentorRating;
  createdAt: string;
  dateLabel: string;
  text: string;
}

export interface MentorReviewsProps {
  reviews: MentorReview[];
  title?: string;
}

export function MentorReviews({ reviews, title = 'Mentee reviews' }: MentorReviewsProps) {
  const titleId = useId();
  return <section className="dm-mentor-reviews" aria-labelledby={titleId}>
    <h2 id={titleId} className="dm-product-heading">{title}</h2>
    {reviews.length === 0
      ? <div className="dm-mentor-review-empty"><h3 className="dm-product-title">No reviews yet</h3><p className="dm-product-muted">Feedback from completed sessions will appear here.</p></div>
      : <ul className="dm-mentor-review-list">{reviews.map(review => <li key={review.id}>
        <article className="dm-mentor-review" aria-label={`Review by ${review.reviewerName}`}>
          <header><h3 className="dm-product-title">{review.reviewerName}</h3><time dateTime={review.createdAt}>{review.dateLabel}</time></header>
          <span className="dm-mentor-review-stars" role="img" aria-label={`${review.rating} out of 5 stars`}>{ratings.map(value => <Star key={value} aria-hidden="true" data-filled={value <= review.rating} />)}</span>
          <p className="dm-mentor-review-text">{review.text}</p>
        </article>
      </li>)}</ul>}
  </section>;
}

const reviewSchema = z.object({
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)], { error: 'Choose a rating from 1 to 5 stars.' }),
  text: z.string().trim().min(1, 'Write a few words about your session.').max(2000, 'Keep your review to 2,000 characters or fewer.'),
});

export type MentorReviewValues = z.infer<typeof reviewSchema>;
export interface MentorReviewFormProps {
  mentorName: string;
  /** The host checks completed-session eligibility and owns persistence/success UI. */
  onSubmit: (values: MentorReviewValues) => void | Promise<void>;
}

export function MentorReviewForm({ mentorName, onSubmit }: MentorReviewFormProps) {
  const id = useId();
  const [rating, setRating] = useState<0 | MentorRating>(0);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<{ rating?: string; text?: string }>({});
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const ratingControl = useRef<HTMLInputElement>(null);
  const textControl = useRef<HTMLTextAreaElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const result = reviewSchema.safeParse({ rating, text });
    setFailed(false);
    if (!result.success) {
      const nextErrors: { rating?: string; text?: string } = {};
      for (const issue of result.error.issues) nextErrors[issue.path[0] as 'rating' | 'text'] = issue.message;
      setErrors(nextErrors);
      if (nextErrors.rating) ratingControl.current!.focus();
      else textControl.current!.focus();
      return;
    }
    setErrors({});
    submitting.current = true;
    setPending(true);
    try {
      await onSubmit(result.data);
    } catch {
      setFailed(true);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <form className="dm-mentor-review-form" onSubmit={submit} noValidate aria-labelledby={`${id}-title`} aria-busy={pending}>
    <header><h2 id={`${id}-title`} className="dm-product-heading">Review your session with {mentorName}</h2><p className="dm-product-muted">Your rating and review will appear on the mentor’s profile. Keep private code and personal details out of your review.</p></header>
    <fieldset className="dm-mentor-rating-field" disabled={pending} aria-describedby={`${id}-rating-help${errors.rating ? ` ${id}-rating-error` : ''}`} aria-invalid={Boolean(errors.rating)}>
      <legend className="dm-field-label">Your rating <span aria-hidden="true">*</span></legend>
      <p id={`${id}-rating-help`} className="dm-field-description">Choose from 1 to 5 stars.</p>
      <div className="dm-mentor-star-options">{ratings.map(value => <label key={value} className="dm-mentor-star-option" data-filled={rating >= value}>
        <input ref={value === 1 ? ratingControl : undefined} type="radio" name={`${id}-rating`} value={value} checked={rating === value} onChange={() => setRating(value)} required aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`} />
        <span><Star aria-hidden="true" /><span aria-hidden="true">{value}</span></span>
      </label>)}</div>
      {errors.rating && <p id={`${id}-rating-error`} className="dm-field-error" role="alert">{errors.rating}</p>}
    </fieldset>
    <FormField label="Your review" description="What was useful, and what could be better? Up to 2,000 characters." error={errors.text} required>
      {control => <Textarea {...control} ref={textControl} rows={5} value={text} onChange={event => setText(event.target.value)} disabled={pending} />}
    </FormField>
    {failed && <p className="dm-field-error" role="alert">We could not save your review. Your text is still here, so you can try again.</p>}
    <div className="dm-product-actions"><Button type="submit" disabled={pending}>{pending ? 'Saving review…' : 'Submit review'}</Button>{pending && <span className="dm-product-muted" role="status">Saving your review.</span>}</div>
  </form>;
}
